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
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from collector.feed_collector import (
    MAX_TREND_PROJECTS,
    PROCESS_TIMEOUT_SECONDS,
    WORKERS,
    build_packets,
    collection_window,
    collect_generic,
    document,
    fetch_json,
    github_project,
    now_iso,
    packet_payload,
    send_packet,
    trigger_processing,
)

HORIZON_ROOT = Path(__file__).resolve().parent / "vendor" / "horizon"
if not HORIZON_ROOT.is_dir():
    raise RuntimeError("Horizon submodule is missing. Run: git submodule update --init --recursive")
sys.path.insert(0, str(HORIZON_ROOT))

from src.models import GitHubSourceConfig, HackerNewsConfig, OSSInsightConfig, RSSSourceConfig  # noqa: E402
from src.scrapers.github import GitHubScraper  # noqa: E402
from src.scrapers.hackernews import HackerNewsScraper  # noqa: E402
from src.scrapers.ossinsight import OSSInsightScraper  # noqa: E402
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
    repository_candidates: list[dict]
    outcomes: list[SourceOutcome]


class RecordingHttpClient:
    """Internal seam that preserves Horizon's adapter interface and records transport facts."""

    def __init__(self, client: httpx.AsyncClient):
        self._client = client
        self.statuses: list[int] = []
        self.error: str | None = None

    async def get(self, *args, **kwargs):
        try:
            response = await self._client.get(*args, **kwargs)
        except httpx.HTTPError as error:
            self.error = f"{type(error).__name__}: {error}"
            raise
        self.statuses.append(response.status_code)
        return response


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


def horizon_scraper_for(source: dict, client: httpx.AsyncClient):
    connector = source.get("connector")
    if connector == "rss":
        config = RSSSourceConfig(name=source["name"], url=source["endpoint"], category="vault")
        return "horizon-rss", RSSScraper([config], client)
    if connector == "hackernews":
        config = HackerNewsConfig(enabled=True, fetch_top_stories=int(os.environ.get("VAULT2077_HN_TOP_STORIES", "30")), min_score=int(os.environ.get("VAULT2077_HN_MIN_SCORE", "100")), category="vault")
        return "horizon-hackernews", HackerNewsScraper(config, client)
    if connector == "github-releases":
        owner, repo = source["channelIdentifier"].split("/", 1)
        config = GitHubSourceConfig(type="repo_releases", owner=owner, repo=repo, category="vault")
        return "horizon-github", GitHubScraper([config], client)
    if connector == "github-user-events":
        config = GitHubSourceConfig(type="user_events", username=source["channelIdentifier"], category="vault")
        return "horizon-github", GitHubScraper([config], client)
    if connector == "json" and source.get("channelType") == "github-trending":
        config = OSSInsightConfig(enabled=True, period="past_24_hours", languages=[source["channelIdentifier"]], min_stars=0, max_items=MAX_TREND_PROJECTS, category="vault")
        return "horizon-ossinsight", OSSInsightScraper(config, client)
    return None


def normalize_horizon_items(source: dict, items: list[Any]) -> tuple[list[dict], list[dict], int]:
    information: list[dict] = []
    candidates: list[dict] = []
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
        repo_name = item.metadata.get("repo") if isinstance(item.metadata, dict) else None
        if item.source_type.value == "ossinsight" and isinstance(repo_name, str) and "/" in repo_name:
            owner, name = repo_name.split("/", 1)
            candidates.append({"owner": owner, "name": name, "delta24": int(item.metadata.get("stars_gained") or 0)})
    return information, candidates, rejected


async def collect_one(source: dict, since: datetime, until: datetime, client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> tuple[list[dict], list[dict], SourceOutcome]:
    started = time.perf_counter()
    try:
        recording_client = RecordingHttpClient(client)
        adapter = horizon_scraper_for(source, recording_client)
        if adapter is None:
            if source.get("connector") == "json" and source.get("channelIdentifier") == "lobsters":
                async with semaphore:
                    raw_items = await asyncio.to_thread(collect_generic, source, fetch_json(source["endpoint"]), since, until)
                outcome = SourceOutcome(source["id"], source["name"], "vault-lobsters", "success" if raw_items else "empty", len(raw_items), len(raw_items), 0, round((time.perf_counter() - started) * 1000))
                return raw_items, [], outcome
            raise ValueError(f"No approved Horizon adapter for {source.get('connector')} / {source.get('channelType')}")
        adapter_name, scraper = adapter
        async with semaphore:
            items = await scraper.fetch(since)
        information, candidates, rejected = normalize_horizon_items(source, items)
        transport_error = recording_client.error or (f"upstream returned HTTP {max(recording_client.statuses)}" if any(value >= 400 for value in recording_client.statuses) else None)
        status = "partial" if items and transport_error else ("failure" if transport_error else ("success" if items else "empty"))
        error = transport_error
        outcome = SourceOutcome(source["id"], source["name"], adapter_name, status, len(items), len(information), rejected, round((time.perf_counter() - started) * 1000), error)
        return information, candidates, outcome
    except Exception as error:
        outcome = SourceOutcome(source["id"], source["name"], "unavailable", "failure", 0, 0, 0, round((time.perf_counter() - started) * 1000), f"{type(error).__name__}: {error}")
        return [], [], outcome


async def collect_batch(sources: list[dict], since: datetime, until: datetime) -> CollectionResult:
    """Deep collection module interface: one approved bundle in, raw evidence out."""
    semaphore = asyncio.Semaphore(max(1, min(WORKERS, int(os.environ.get("VAULT2077_HORIZON_CONCURRENCY", str(WORKERS))))))
    timeout = httpx.Timeout(float(os.environ.get("VAULT2077_SOURCE_TIMEOUT_SECONDS", "20")))
    limits = httpx.Limits(max_connections=WORKERS, max_keepalive_connections=WORKERS)
    headers = {"User-Agent": "Vault2077-Horizon-Raw-Export/1.0 (+https://vault2077.com)"}
    async with httpx.AsyncClient(timeout=timeout, limits=limits, headers=headers) as client:
        results = await asyncio.gather(*(collect_one(source, since, until, client, semaphore) for source in sources))
    information = [item for records, _, _ in results for item in records]
    candidates = [candidate for _, records, _ in results for candidate in records]
    outcomes = [outcome for _, _, outcome in results]
    return CollectionResult(information, candidates, outcomes)


def enrich_repositories(candidates: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    for candidate in candidates:
        key = f"{candidate['owner']}/{candidate['name']}".lower()
        if key not in unique or candidate["delta24"] > unique[key]["delta24"]:
            unique[key] = candidate
    selected = sorted(unique.values(), key=lambda item: item["delta24"], reverse=True)[:MAX_TREND_PROJECTS]
    if not selected:
        return []
    from concurrent.futures import ThreadPoolExecutor, as_completed

    repositories = []
    with ThreadPoolExecutor(max_workers=min(8, len(selected))) as pool:
        futures = [pool.submit(github_project, candidate) for candidate in selected]
        for future in as_completed(futures):
            try:
                repositories.append(future.result())
            except Exception:
                continue
    return repositories


def main() -> None:
    bundle_path = Path(os.environ.get("VAULT2077_SOURCE_BUNDLE_FILE", "config/source-bundle.json"))
    output_dir = Path(os.environ.get("VAULT2077_COLLECTOR_OUTPUT_DIR", ".collector-output"))
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    sources = selected_sources(bundle.get("sources", []))
    if not sources:
        raise RuntimeError("No approved sources selected for collection.")
    start, end = collection_window()
    result = asyncio.run(collect_batch(sources, start, end))
    repositories = enrich_repositories(result.repository_candidates)
    if not any(outcome.status != "failure" for outcome in result.outcomes):
        raise RuntimeError("Every selected source failed; no batch was produced.")

    generated_at = now_iso()
    packets = build_packets(bundle["revision"], now_iso(start), now_iso(end), generated_at, result.information, repositories)
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
        "repositories": len(repositories),
        "packets": len(packets),
        "packetFiles": packet_files,
        "receipts": receipts,
        "processing": processing,
        "outcomes": [asdict(outcome) for outcome in result.outcomes],
        "failures": failures,
    }
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("sourcesAttempted", "sourcesSucceeded", "sourcesPartial", "sourcesEmpty", "sourcesFailed", "information", "repositories", "packets")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
