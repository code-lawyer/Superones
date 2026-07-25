"""Vault2077 raw export built on Horizon's collection adapters.

The public interface of this module is deliberately small: read an approved
source bundle, collect original records, and emit Vault-signed batches.  The
Horizon submodule stays behind that seam; its AI, article extraction, daily
briefing, and delivery features are intentionally never imported or run.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

from collector.feed_collector import (
    PROCESS_TIMEOUT_SECONDS,
    WORKERS,
    build_packets,
    collection_window,
    collect_hackernews,
    collect_lobsters,
    collect_source,
    document,
    now_iso,
    packet_payload,
    plain_text,
    send_packet,
    trigger_processing,
    validate_public_https_url,
)

HORIZON_ROOT = Path(__file__).resolve().parent / "vendor" / "horizon"
if not HORIZON_ROOT.is_dir():
    raise RuntimeError("Horizon submodule is missing. Run: git submodule update --init --recursive")
sys.path.insert(0, str(HORIZON_ROOT))

from src.models import GitHubSourceConfig, RSSSourceConfig  # noqa: E402
from src.scrapers.github import GitHubScraper  # noqa: E402
from src.scrapers.rss import RSSScraper  # noqa: E402


@dataclass
class SourceOutcome:
    source_id: str
    source_name: str
    adapter: str
    status: str
    fetched: int
    accepted: int
    rejected: int
    duration_ms: int
    error: str | None = None


@dataclass
class CollectionResult:
    information: list[dict]
    discovery_candidates: list[dict]
    outcomes: list[SourceOutcome]


class RecordingHttpClient:
    """Internal seam that preserves Horizon's adapter interface and records transport facts."""

    def __init__(self, client: httpx.AsyncClient):
        self._client = client
        self.statuses: list[int] = []
        self.error: str | None = None

    async def get(self, *args, **kwargs):
        retryable_statuses = {403, 408, 425, 429, 500, 502, 503, 504}
        for attempt in range(3):
            try:
                response = await self._client.get(*args, **kwargs)
            except httpx.HTTPError as error:
                if attempt < 2:
                    await asyncio.sleep(0.25 * (2 ** attempt))
                    continue
                self.error = f"{type(error).__name__}: {error}"
                raise
            if response.status_code not in retryable_statuses or attempt == 2:
                self.statuses.append(response.status_code)
                return response
            await response.aread()
            await response.aclose()
            await asyncio.sleep(0.25 * (2 ** attempt))
        raise RuntimeError("unreachable retry state")


def repair_utf8_mojibake(value: str | None) -> str:
    """Repair only the common UTF-8-as-Windows-1252 corruption seen in some feeds.

    This runs before a record crosses the border so that the preserved original
    text remains readable.  A candidate is accepted only when decoding succeeds
    and removes corruption markers; otherwise the upstream text is unchanged.
    """
    original = str(value or "")
    markers = ("â", "Ã", "ð", "€", "™", "œ")
    if not any(marker in original for marker in markers):
        return original
    try:
        repaired = original.encode("cp1252").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return original
    original_score = sum(original.count(marker) for marker in markers)
    repaired_score = sum(repaired.count(marker) for marker in markers)
    return repaired if repaired_score < original_score else original


def selected_sources(sources: list[dict]) -> list[dict]:
    """Optionally narrow a run without changing the approved bundle."""
    requested = {value.strip() for value in os.environ.get("VAULT2077_SOURCE_IDS", "").split(",") if value.strip()}
    return [source for source in sources if not requested or source.get("id") in requested]


def _normalized_host(value: str) -> str:
    host = (urlparse(value).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _publisher_scope_url(source: dict) -> str:
    home_url = str(source.get("homeUrl") or "")
    if home_url:
        return home_url
    if source.get("connector") == "github-releases" and "/" in str(source.get("channelIdentifier") or ""):
        return f"https://github.com/{source['channelIdentifier']}"
    endpoint = str(source.get("endpoint") or "")
    parsed = urlparse(endpoint)
    if source.get("connector") != "rss" or not parsed.hostname:
        return ""
    parts = [part for part in parsed.path.split("/") if part]
    if parts and (
        parts[-1].lower() in {"rss", "feed", "atom", "feed.xml", "rss.xml", "index.xml"}
        or parts[-1].lower().endswith((".rss", ".atom"))
    ):
        parts.pop()
    return urlunparse((parsed.scheme, parsed.netloc, f"/{'/'.join(parts)}" if parts else "", "", "", ""))


def canonical_source_for_url(url: str, sources: list[dict]) -> dict | None:
    """Resolve a discovered URL only against an explicitly approved publisher."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    host = _normalized_host(url)
    candidates: list[tuple[int, dict]] = []
    for source in sources:
        if (
            source.get("provenanceRole") != "canonical"
            or source.get("contentGroup") not in {"information", "documents", "roadside"}
            or source.get("originPlatform") == "x"
            or source.get("connector") in {"hackernews", "json"}
        ):
            continue
        home_url = _publisher_scope_url(source)
        if not home_url:
            continue
        if host != _normalized_host(home_url):
            continue
        home_path = urlparse(home_url).path.rstrip("/")
        if home_path and parsed.path != home_path and not parsed.path.startswith(f"{home_path}/"):
            continue
        score = len(home_path)
        candidates.append((score, source))
    if not candidates:
        return None
    candidates.sort(key=lambda value: value[0], reverse=True)
    if len(candidates) > 1 and candidates[0][0] == candidates[1][0]:
        return None
    return candidates[0][1]


def _meta(payload: str, *names: str) -> str:
    for name in names:
        escaped = re.escape(name)
        patterns = (
            rf'<meta\b[^>]*(?:property|name)=["\']{escaped}["\'][^>]*content=["\']([^"\']+)["\']',
            rf'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']{escaped}["\']',
        )
        for pattern in patterns:
            match = re.search(pattern, payload, re.IGNORECASE)
            if match:
                return plain_text(match.group(1)).strip()
    return ""


def _canonical_link(payload: str) -> str:
    for tag in re.findall(r"<link\b[^>]*>", payload, re.IGNORECASE):
        if not re.search(r'\brel=["\'][^"\']*\bcanonical\b', tag, re.IGNORECASE):
            continue
        match = re.search(r'\bhref=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _article_text(payload: str) -> str:
    without_noise = re.sub(
        r"<(script|style|svg|nav|footer|header)\b[^>]*>[\s\S]*?</\1>",
        " ",
        payload,
        flags=re.IGNORECASE,
    )
    match = re.search(r"<(article|main)\b[^>]*>([\s\S]*?)</\1>", without_noise, re.IGNORECASE)
    return plain_text(match.group(2) if match else "").strip()


async def promote_discovery_candidates(
    candidates: list[dict],
    sources: list[dict],
    client: httpx.AsyncClient,
) -> tuple[list[dict], list[dict], dict[str, tuple[dict, int, int]]]:
    """Promote only traceable full-text originals; unknown domains remain candidates."""
    grouped: dict[str, list[dict]] = {}
    for candidate in candidates:
        canonical_url = str(candidate.get("canonicalUrl") or "")
        parsed = urlparse(canonical_url)
        normalized = urlunparse((parsed.scheme, parsed.netloc.lower(), parsed.path, "", parsed.query, ""))
        if canonical_source_for_url(normalized, sources):
            grouped.setdefault(normalized, []).append(candidate)

    promoted: list[dict] = []
    promoted_urls: set[str] = set()
    source_stats: dict[str, tuple[dict, int, int]] = {}
    semaphore = asyncio.Semaphore(max(1, min(6, WORKERS)))

    async def promote(url: str, paths: list[dict]) -> None:
        source = canonical_source_for_url(url, sources)
        if source is None:
            return
        accepted = 0
        try:
            validate_public_https_url(url)
            async with semaphore:
                response = await client.get(
                    url,
                    follow_redirects=True,
                    headers={"Accept": "text/html,application/xhtml+xml"},
                )
            response.raise_for_status()
            final_url = str(response.url)
            if canonical_source_for_url(final_url, sources) is not source:
                return
            payload = response.text
            canonical_url = _canonical_link(payload) or _meta(payload, "og:url") or final_url
            if canonical_source_for_url(canonical_url, sources) is not source:
                canonical_url = final_url
            title = _meta(payload, "og:title", "twitter:title")
            if not title:
                title = plain_text(re.search(r"<title\b[^>]*>([\s\S]*?)</title>", payload, re.IGNORECASE).group(1)) if re.search(r"<title\b[^>]*>([\s\S]*?)</title>", payload, re.IGNORECASE) else ""
            body = _article_text(payload)
            if len(body) < 120:
                return
            normalized = document(
                source,
                canonical_url,
                title or paths[0].get("title"),
                body,
                _meta(payload, "article:published_time", "date", "datePublished") or paths[0].get("publishedAt"),
                _meta(payload, "author", "article:author"),
                {
                    "discoveryPath": paths[0].get("discoveryUrl"),
                    "provenanceRole": "canonical",
                    "provenanceStatus": "verified",
                },
            )
            if normalized is None:
                return
            normalized["discoveryPaths"] = sorted({
                str(path.get("discoveryUrl"))
                for path in paths
                if path.get("discoveryUrl")
            })
            normalized["contentCompleteness"] = "fulltext"
            promoted.append(normalized)
            promoted_urls.update(str(path.get("canonicalUrl")) for path in paths)
            accepted = 1
        except (httpx.HTTPError, ValueError):
            return
        finally:
            previous = source_stats.get(source["id"])
            fetched = (previous[1] if previous else 0) + 1
            total_accepted = (previous[2] if previous else 0) + accepted
            source_stats[source["id"]] = (source, fetched, total_accepted)

    await asyncio.gather(*(promote(url, paths) for url, paths in grouped.items()))
    unresolved = [
        {
            **candidate,
            "status": "promoted"
            if str(candidate.get("canonicalUrl")) in promoted_urls
            else str(candidate.get("status") or "candidate"),
        }
        for candidate in candidates
    ]
    return promoted, unresolved, source_stats


def horizon_scraper_for(source: dict, client: httpx.AsyncClient):
    connector = source.get("connector")
    if connector == "rss":
        config = RSSSourceConfig(name=source["name"], url=source["endpoint"], category="vault")
        return "horizon-rss", RSSScraper([config], client)
    if connector == "github-releases":
        owner, repo = source["channelIdentifier"].split("/", 1)
        config = GitHubSourceConfig(type="repo_releases", owner=owner, repo=repo, category="vault")
        return "horizon-github", GitHubScraper([config], client)
    return None


def normalize_horizon_items(source: dict, items: list[Any]) -> tuple[list[dict], int]:
    information: list[dict] = []
    rejected = 0
    for item in items:
        normalized = document(
            source,
            repair_utf8_mojibake(str(item.url)),
            repair_utf8_mojibake(item.title),
            repair_utf8_mojibake(item.content or ""),
            now_iso(item.published_at),
            repair_utf8_mojibake(item.author or ""),
        )
        if normalized is None:
            rejected += 1
            continue
        information.append(normalized)
    return information, rejected


async def collect_one(source: dict, since: datetime, until: datetime, client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> tuple[list[dict], list[dict], SourceOutcome]:
    started = time.perf_counter()
    try:
        if source.get("connector") == "hackernews":
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_hackernews, source, since, until)
            outcome = SourceOutcome(source["id"], source["name"], "vault-hackernews-discovery", "success" if records or candidates else "empty", len(records) + len(candidates), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, candidates, outcome
        if source.get("connector") == "json" and source.get("channelIdentifier") == "lobsters":
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_lobsters, source, since, until)
            outcome = SourceOutcome(source["id"], source["name"], "vault-lobsters-discovery", "success" if records or candidates else "empty", len(records) + len(candidates), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, candidates, outcome
        if source.get("connector") in {"sitemap", "dated-index"}:
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_source, source, since, until)
            outcome = SourceOutcome(source["id"], source["name"], f"vault-{source['connector']}", "success" if records else "empty", len(records), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, candidates, outcome
        recording_client = RecordingHttpClient(client)
        adapter = horizon_scraper_for(source, recording_client)
        if adapter is None:
            raise ValueError(f"No approved Horizon adapter for {source.get('connector')} / {source.get('channelType')}")
        adapter_name, scraper = adapter
        async with semaphore:
            fetched_items = await scraper.fetch(since)
        information, rejected = normalize_horizon_items(source, fetched_items)
        transport_error = recording_client.error or (f"upstream returned HTTP {max(recording_client.statuses)}" if any(value >= 400 for value in recording_client.statuses) else None)
        status = "partial" if fetched_items and transport_error else ("failure" if transport_error else ("success" if fetched_items else "empty"))
        error = transport_error
        outcome = SourceOutcome(source["id"], source["name"], adapter_name, status, len(fetched_items), len(information), rejected, round((time.perf_counter() - started) * 1000), error)
        return information, [], outcome
    except Exception as error:
        outcome = SourceOutcome(source["id"], source["name"], "unavailable", "failure", 0, 0, 0, round((time.perf_counter() - started) * 1000), f"{type(error).__name__}: {error}")
        return [], [], outcome


async def collect_batch(
    sources: list[dict],
    since: datetime,
    until: datetime,
    canonical_sources: list[dict] | None = None,
) -> CollectionResult:
    """Deep collection module interface: one approved bundle in, raw evidence out."""
    semaphore = asyncio.Semaphore(max(1, min(WORKERS, int(os.environ.get("VAULT2077_HORIZON_CONCURRENCY", str(WORKERS))))))
    timeout = httpx.Timeout(float(os.environ.get("VAULT2077_SOURCE_TIMEOUT_SECONDS", "20")))
    limits = httpx.Limits(max_connections=WORKERS, max_keepalive_connections=WORKERS)
    headers = {"User-Agent": "Vault2077-Horizon-Raw-Export/1.0 (+https://vault2077.com)"}
    async with httpx.AsyncClient(timeout=timeout, limits=limits, headers=headers) as client:
        results = await asyncio.gather(*(collect_one(source, since, until, client, semaphore) for source in sources))
        information = [item for records, _, _ in results for item in records]
        discovery_candidates = [item for _, candidates, _ in results for item in candidates]
        outcomes = [outcome for _, _, outcome in results]
        promoted, discovery_candidates, promoted_stats = await promote_discovery_candidates(
            discovery_candidates,
            canonical_sources or sources,
            client,
        )
    information.extend(promoted)
    outcome_by_id = {outcome.source_id: outcome for outcome in outcomes}
    for source_id, (source, fetched, accepted) in promoted_stats.items():
        existing = outcome_by_id.get(source_id)
        if existing:
            existing.fetched += fetched
            existing.accepted += accepted
            if accepted and existing.status == "empty":
                existing.status = "success"
            continue
        outcome = SourceOutcome(
            source_id,
            source["name"],
            "canonical-discovery",
            "success" if accepted else "empty",
            fetched,
            accepted,
            fetched - accepted,
            0,
        )
        outcomes.append(outcome)
        outcome_by_id[source_id] = outcome
    return CollectionResult(information, discovery_candidates, outcomes)


def main() -> None:
    bundle_path = Path(os.environ.get("VAULT2077_SOURCE_BUNDLE_FILE", "config/source-bundle.json"))
    output_dir = Path(os.environ.get("VAULT2077_COLLECTOR_OUTPUT_DIR", ".collector-output"))
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    sources = selected_sources(bundle.get("sources", []))
    if not sources:
        raise RuntimeError("No approved sources selected for collection.")
    start, end = collection_window()
    result = asyncio.run(collect_batch(sources, start, end, bundle.get("sources", [])))
    if not any(outcome.status != "failure" for outcome in result.outcomes):
        raise RuntimeError("Every selected source failed; no batch was produced.")

    generated_at = now_iso()
    (output_dir / "discovery-candidates.json").write_text(
        json.dumps(result.discovery_candidates, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    packets = build_packets(bundle["revision"], now_iso(start), now_iso(end), generated_at, result.information, [])
    payloads: dict[str, bytes] = {}
    packet_files = []
    for packet in packets:
        payload = packet_payload(packet)
        target = output_dir / f"{packet['batchId']}.json"
        target.write_bytes(payload)
        payloads[packet["batchId"]] = payload
        packet_files.append(str(target))

    receipts = []
    processing = None
    ingest_url = os.environ.get("VAULT2077_DOMESTIC_INGEST_URL")
    shared_secret = os.environ.get("VAULT2077_PIPELINE_SHARED_SECRET")
    if ingest_url or shared_secret:
        if not ingest_url or not shared_secret:
            raise RuntimeError("VAULT2077_DOMESTIC_INGEST_URL and VAULT2077_PIPELINE_SHARED_SECRET must be configured together.")
        for packet in packets:
            receipts.append(send_packet(ingest_url, shared_secret, packet, payloads[packet["batchId"]]))
        if os.environ.get("VAULT2077_TRIGGER_PROCESSING", "true").lower() == "true":
            process_url = os.environ.get("VAULT2077_DOMESTIC_PROCESS_URL") or f"{ingest_url.rstrip('/')}/process"
            processing = trigger_processing(process_url, shared_secret, 20)

    failures = [asdict(outcome) for outcome in result.outcomes if outcome.status == "failure"]
    report = {
        "runtime": "horizon-raw-export",
        "horizonCommit": "1e2fdc7ccb177f33c59aef2082c4093e1e82b22c",
        "bundleRevision": bundle.get("revision"),
        "collectedFrom": now_iso(start),
        "collectedUntil": now_iso(end),
        "generatedAt": generated_at,
        "sourcesAttempted": len(sources),
        "sourcesSucceeded": sum(outcome.status == "success" for outcome in result.outcomes),
        "sourcesPartial": sum(outcome.status == "partial" for outcome in result.outcomes),
        "sourcesEmpty": sum(outcome.status == "empty" for outcome in result.outcomes),
        "sourcesFailed": len(failures),
        "information": len(result.information),
        "discoveryCandidates": len(result.discovery_candidates),
        "repositories": 0,
        "packets": len(packets),
        "packetFiles": packet_files,
        "receipts": receipts,
        "processing": processing,
        "outcomes": [asdict(outcome) for outcome in result.outcomes],
        "failures": failures,
    }
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("sourcesAttempted", "sourcesSucceeded", "sourcesPartial", "sourcesEmpty", "sourcesFailed", "information", "discoveryCandidates", "repositories", "packets")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
