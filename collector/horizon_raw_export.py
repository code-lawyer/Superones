"""Vault2077 raw export built on Horizon's collection adapters.

The public interface of this module is deliberately small: read an approved
source bundle, collect original records, and emit raw packets. The Node unified
acquisition module alone owns signing and reliable delivery. The
Horizon submodule stays behind that seam; its AI, article extraction, daily
briefing, and delivery features are intentionally never imported or run.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from collector.feed_collector import (
    WORKERS,
    build_packets,
    collect_hackernews,
    collect_lobsters,
    collect_source,
    collection_window,
    document,
    now_iso,
    packet_payload,
    validate_public_https_url,
)

SUPPORTED_RUNTIME_CONNECTORS = frozenset({"rss", "github-releases", "follow-builders-x"})

HORIZON_ROOT = Path(__file__).resolve().parent / "vendor" / "horizon"
if not HORIZON_ROOT.is_dir():
    raise RuntimeError("Horizon submodule is missing. Run: git submodule update --init --recursive")
sys.path.insert(0, str(HORIZON_ROOT))

from src.models import GitHubSourceConfig, RSSSourceConfig  # noqa: E402
from src.scrapers.github import GitHubScraper  # noqa: E402
from src.scrapers.rss import RSSScraper  # noqa: E402


class FullContentRSSScraper(RSSScraper):
    """Prefer content:encoded over a feed's short description."""

    async def _fetch_feed(self, source: RSSSourceConfig, since: datetime):
        self._fulltext_hashes: set[str] = set()
        items = await super()._fetch_feed(source, since)
        for item in items:
            content = item.content or ""
            if hashlib.sha256(content.encode("utf-8")).hexdigest() in self._fulltext_hashes:
                item.metadata["content_completeness"] = "fulltext"
        return items

    def _extract_content(self, entry: dict) -> str:
        content = entry.get("content")
        if content:
            value = content[0].get("value", "")
            if value:
                self._fulltext_hashes.add(hashlib.sha256(value.encode("utf-8")).hexdigest())
                return value
        return entry.get("summary") or entry.get("description") or ""


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
    outcomes: list[SourceOutcome]


class RecordingHttpClient:
    """Internal seam that preserves Horizon's adapter interface and records transport facts."""

    def __init__(self, client: httpx.AsyncClient, allowed_origins: set[str]):
        self._client = client
        self._allowed_origins = allowed_origins
        self.statuses: list[int] = []
        self.error: str | None = None
        self.release_flags: dict[str, dict[str, bool]] = {}
        self.filtered_release_count = 0

    def _record_release_flags(self, url: str, response: httpx.Response) -> None:
        if not urlparse(url).path.endswith("/releases") or response.status_code >= 400:
            return
        try:
            releases = response.json()
        except (ValueError, json.JSONDecodeError):
            return
        if not isinstance(releases, list):
            return
        for release in releases:
            if not isinstance(release, dict) or not release.get("html_url"):
                continue
            self.release_flags[str(release["html_url"])] = {
                "prerelease": release.get("prerelease") is True,
                "draft": release.get("draft") is True,
            }

    def _without_draft_releases(self, url: str, response: httpx.Response) -> httpx.Response:
        if not urlparse(url).path.endswith("/releases") or response.status_code >= 400:
            return response
        try:
            releases = response.json()
        except (ValueError, json.JSONDecodeError):
            return response
        if not isinstance(releases, list):
            return response
        visible = [release for release in releases if not isinstance(release, dict) or release.get("draft") is not True]
        self.filtered_release_count += len(releases) - len(visible)
        if len(visible) == len(releases):
            return response
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            json=visible,
            request=response.request,
            extensions=response.extensions,
        )

    async def _get_once(self, url: str, *args, **kwargs):
        current_url = url
        request_options = dict(kwargs)
        request_options.pop("follow_redirects", None)
        for _redirect in range(6):
            validate_public_https_url(current_url)
            parsed = urlparse(current_url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if origin not in self._allowed_origins:
                raise ValueError(f"Redirect origin is not approved for this source: {origin}")
            response = await self._client.get(current_url, *args, follow_redirects=False, **request_options)
            if response.status_code not in {301, 302, 303, 307, 308}:
                return response
            location = response.headers.get("location")
            await response.aread()
            await response.aclose()
            if not location:
                raise ValueError("Upstream redirect omitted Location.")
            current_url = urljoin(current_url, location)
        raise ValueError("Upstream exceeded five approved redirects.")

    async def get(self, *args, **kwargs):
        if not args:
            raise ValueError("Horizon transport requires an explicit URL.")
        url = str(args[0])
        retryable_statuses = {403, 408, 425, 429, 500, 502, 503, 504}
        for attempt in range(3):
            try:
                response = await self._get_once(url, *args[1:], **kwargs)
            except ValueError as error:
                self.error = f"{type(error).__name__}: {error}"
                raise
            except httpx.HTTPError as error:
                if attempt < 2:
                    await asyncio.sleep(0.25 * (2 ** attempt))
                    continue
                self.error = f"{type(error).__name__}: {error}"
                raise
            if response.status_code not in retryable_statuses or attempt == 2:
                self.statuses.append(response.status_code)
                self._record_release_flags(url, response)
                return self._without_draft_releases(url, response)
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


def validate_runtime_connectors(sources: list[dict]) -> None:
    """Fail before collection when the approved bundle names an unimplemented adapter."""
    unsupported = sorted({
        str(source.get("connector") or "<missing>")
        for source in sources
        if source.get("connector") not in SUPPORTED_RUNTIME_CONNECTORS
    })
    if unsupported:
        raise ValueError(f"Approved source bundle contains unsupported runtime connectors: {', '.join(unsupported)}")


def approved_transport_origins(source: dict) -> set[str]:
    origins = set(source.get("allowedRedirectOrigins") or [])
    endpoint = source.get("endpoint")
    if endpoint:
        parsed = urlparse(str(endpoint))
        if parsed.scheme and parsed.netloc:
            origins.add(f"{parsed.scheme}://{parsed.netloc}")
    if source.get("connector") == "github-releases":
        origins.add("https://api.github.com")
    return origins


def horizon_scraper_for(source: dict, client: httpx.AsyncClient):
    connector = source.get("connector")
    if connector == "rss":
        config = RSSSourceConfig(name=source["name"], url=source["endpoint"], category="vault")
        return "horizon-rss", FullContentRSSScraper([config], client)
    if connector == "github-releases":
        owner, repo = source["channelIdentifier"].split("/", 1)
        config = GitHubSourceConfig(type="repo_releases", owner=owner, repo=repo, category="vault")
        return "horizon-github", GitHubScraper([config], client)
    return None


def normalize_horizon_items(
    source: dict,
    items: list[Any],
    release_flags: dict[str, dict[str, bool]] | None = None,
) -> tuple[list[dict], int]:
    information: list[dict] = []
    rejected = 0
    for item in items:
        url = repair_utf8_mojibake(str(item.url))
        title = repair_utf8_mojibake(item.title)
        flags = (release_flags or {}).get(url, {})
        release_identity = f"{title} {item.metadata.get('tag', '')} {url}"
        if source.get("connector") == "github-releases" and (
            item.metadata.get("prerelease") is True
            or flags.get("prerelease") is True
            or flags.get("draft") is True
            or re.search(r"\b(?:nightly|snapshot|canary|continuous)\b", release_identity, flags=re.IGNORECASE)
        ):
            rejected += 1
            continue
        is_latent_space = source.get("name") == "Latent Space" or source.get("id") == "source-latent-space"
        overrides = {
            "contentCompleteness": "fulltext",
        } if is_latent_space and item.metadata.get("content_completeness") == "fulltext" else {}
        if source.get("connector") == "github-releases":
            overrides.update({
                "releasePrerelease": item.metadata.get("prerelease") is True or flags.get("prerelease") is True,
                "releaseDraft": flags.get("draft") is True,
            })
        if is_latent_space:
            is_digest = title.lstrip().lower().startswith("[ainews]") or "/p/ainews-" in url.lower()
            if is_digest:
                overrides.update({
                    "contentClass": "digest",
                    "eventEligible": False,
                    "evidenceNature": "discovery_aggregate",
                })
        normalized = document(
            source,
            url,
            title,
            repair_utf8_mojibake(item.content or ""),
            now_iso(item.published_at),
            repair_utf8_mojibake(item.author or ""),
            overrides,
        )
        if normalized is None:
            rejected += 1
            continue
        information.append(normalized)
    return information, rejected


async def collect_one(source: dict, since: datetime, until: datetime, client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> tuple[list[dict], SourceOutcome]:
    started = time.perf_counter()
    try:
        # Legacy direct-call adapters remain for fixture compatibility. The
        # approved runtime bundle rejects both connectors before collection.
        if source.get("connector") == "hackernews":
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_hackernews, source, since, until)
            if candidates:
                raise RuntimeError("Hacker News must not emit discovery candidates.")
            outcome = SourceOutcome(source["id"], source["name"], "vault-hackernews-community", "success" if records else "empty", len(records), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, outcome
        if source.get("connector") == "json" and source.get("channelIdentifier") == "lobsters":
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_lobsters, source, since, until)
            if candidates:
                raise RuntimeError("Lobsters must not emit discovery candidates.")
            outcome = SourceOutcome(source["id"], source["name"], "vault-lobsters-community", "success" if records else "empty", len(records), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, outcome
        if source.get("connector") == "follow-builders-x":
            async with semaphore:
                records, candidates = await asyncio.to_thread(collect_source, source, since, until)
            if candidates:
                raise RuntimeError("Approved source adapters must not emit discovery candidates.")
            outcome = SourceOutcome(source["id"], source["name"], f"vault-{source['connector']}", "success" if records else "empty", len(records), len(records), 0, round((time.perf_counter() - started) * 1000))
            return records, outcome
        recording_client = RecordingHttpClient(client, approved_transport_origins(source))
        adapter = horizon_scraper_for(source, recording_client)
        if adapter is None:
            raise ValueError(f"No approved Horizon adapter for {source.get('connector')} / {source.get('channelType')}")
        adapter_name, scraper = adapter
        async with semaphore:
            fetched_items = await scraper.fetch(since)
        information, rejected = normalize_horizon_items(source, fetched_items, recording_client.release_flags)
        observed_count = len(fetched_items) + recording_client.filtered_release_count
        rejected += recording_client.filtered_release_count
        transport_error = recording_client.error or (f"upstream returned HTTP {max(recording_client.statuses)}" if any(value >= 400 for value in recording_client.statuses) else None)
        status = "partial" if observed_count and transport_error else ("failure" if transport_error else ("success" if observed_count else "empty"))
        error = transport_error
        outcome = SourceOutcome(source["id"], source["name"], adapter_name, status, observed_count, len(information), rejected, round((time.perf_counter() - started) * 1000), error)
        return information, outcome
    except Exception as error:
        outcome = SourceOutcome(source["id"], source["name"], "unavailable", "failure", 0, 0, 0, round((time.perf_counter() - started) * 1000), f"{type(error).__name__}: {error}")
        return [], outcome


async def collect_batch(
    sources: list[dict],
    since: datetime,
    until: datetime,
) -> CollectionResult:
    """Deep collection module interface: one approved bundle in, raw evidence out."""
    validate_runtime_connectors(sources)
    semaphore = asyncio.Semaphore(max(1, min(WORKERS, int(os.environ.get("VAULT2077_HORIZON_CONCURRENCY", str(WORKERS))))))
    timeout = httpx.Timeout(float(os.environ.get("VAULT2077_SOURCE_TIMEOUT_SECONDS", "20")))
    limits = httpx.Limits(max_connections=WORKERS, max_keepalive_connections=WORKERS)
    headers = {"User-Agent": "Vault2077-Horizon-Raw-Export/1.0 (+https://superones.top)"}
    async with httpx.AsyncClient(timeout=timeout, limits=limits, headers=headers) as client:
        results = await asyncio.gather(*(collect_one(source, since, until, client, semaphore) for source in sources))
        information = [item for records, _ in results for item in records]
        outcomes = [outcome for _, outcome in results]
    return CollectionResult(information, outcomes)


def main() -> None:
    bundle_path = Path(os.environ.get("VAULT2077_SOURCE_BUNDLE_FILE", "config/source-bundle.json"))
    output_dir = Path(os.environ.get("VAULT2077_COLLECTOR_OUTPUT_DIR", ".collector-output"))
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    sources = selected_sources(bundle.get("sources", []))
    if not sources:
        raise RuntimeError("No approved sources selected for collection.")
    lookback_hours = max(1, min(24 * 90, int(os.environ.get("VAULT2077_COLLECTION_LOOKBACK_HOURS", "12"))))
    start, end = collection_window(lookback_hours=lookback_hours)
    result = asyncio.run(collect_batch(sources, start, end))
    if not any(outcome.status != "failure" for outcome in result.outcomes):
        raise RuntimeError("Every selected source failed; no batch was produced.")

    generated_at = now_iso()
    packets = build_packets(bundle["revision"], now_iso(start), now_iso(end), generated_at, result.information, [])
    packet_files = []
    for packet in packets:
        payload = packet_payload(packet)
        target = output_dir / f"{packet['batchId']}.json"
        target.write_bytes(payload)
        packet_files.append(str(target))

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
        "repositories": 0,
        "packets": len(packets),
        "packetFiles": packet_files,
        "outcomes": [asdict(outcome) for outcome in result.outcomes],
        "failures": failures,
    }
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("sourcesAttempted", "sourcesSucceeded", "sourcesPartial", "sourcesEmpty", "sourcesFailed", "information", "repositories", "packets")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
