"""Vault2077 overseas collector.

This is the complete overseas runtime: load the frozen source bundle, collect
machine-readable feeds/APIs, normalize public records, split bounded immutable
batches, HMAC-sign them, and send them to the domestic ingest gateway. It does
not use a browser, a database, or an LLM.
"""

from __future__ import annotations

import base64
import calendar
import hashlib
import hmac
import ipaddress
import json
import os
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from threading import BoundedSemaphore, Lock
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

USER_AGENT = "Vault2077-Overseas-Collector/2.0 (+https://vault2077.com)"
MAX_ITEMS_PER_SOURCE = int(os.environ.get("VAULT2077_MAX_ITEMS_PER_SOURCE", "20"))
WORKERS = int(os.environ.get("VAULT2077_COLLECTOR_CONCURRENCY", "24"))
PER_HOST_WORKERS = int(os.environ.get("VAULT2077_PER_HOST_CONCURRENCY", "4"))
TIMEOUT_SECONDS = int(os.environ.get("VAULT2077_SOURCE_TIMEOUT_SECONDS", "20"))
LOOKBACK_HOURS = int(os.environ.get("VAULT2077_COLLECTION_LOOKBACK_HOURS", "12"))
MAX_BATCH_ITEMS = 200
MAX_PACKET_BYTES = int(os.environ.get("VAULT2077_MAX_PACKET_BYTES", "1750000"))
PACKET_METADATA_RESERVE = 256
MAX_UPSTREAM_BYTES = int(os.environ.get("VAULT2077_MAX_UPSTREAM_BYTES", "8000000"))
MAX_TREND_PROJECTS = int(os.environ.get("VAULT2077_MAX_TREND_PROJECTS", "30"))
PROCESS_TIMEOUT_SECONDS = int(os.environ.get("VAULT2077_PROCESS_TIMEOUT_SECONDS", "300"))

_host_lock = Lock()
_host_semaphores: dict[str, BoundedSemaphore] = {}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value) -> str:
    raw = str(value or "")
    if "<" not in raw or ">" not in raw:
        return raw
    parser = _TextExtractor()
    try:
        parser.feed(raw)
        return "".join(parser.parts)
    except Exception:
        return raw


def validate_public_https_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError(f"Only credential-free public HTTPS URLs are allowed: {url}")
    host = parsed.hostname.lower()
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValueError(f"Cannot resolve upstream host {host}: {error}") from error
    if not addresses:
        raise ValueError(f"Upstream host {host} has no address.")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError(f"Upstream host {host} resolves to a non-public address.")


class _PublicHttpsRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        validate_public_https_url(new_url)
        return super().redirect_request(request, file_pointer, code, message, headers, new_url)


_public_opener = build_opener(_PublicHttpsRedirectHandler())


def as_text(value, limit: int) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())[:limit]


def now_iso(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def collection_window(now: datetime | None = None, lookback_hours: int = LOOKBACK_HOURS) -> tuple[datetime, datetime]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidates = [
        current.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=day_offset)
        for day_offset in (0, -1)
        for hour in (4, 10, 16, 22)
    ]
    cutoff = max(candidate for candidate in candidates if candidate <= current)
    return cutoff - timedelta(hours=lookback_hours), cutoff


def in_window(value, start: datetime, end: datetime) -> bool:
    parsed = parse_time(value)
    return parsed is None or start < parsed <= end


def source_role(source: dict) -> str:
    nature = source.get("evidenceNature")
    kind = source.get("publisherKind")
    if nature == "primary":
        return "官方" if kind in {"organization", "open_source_project"} else "评论"
    if nature == "reported_analysis":
        return "媒体" if kind == "editorial_media" else "评论"
    if nature == "social_community":
        return "评论"
    return "研究"


def provenance(source: dict, original_url: str) -> dict:
    source_stream = source.get("sourceStream") or ("statements" if source.get("channelType") == "x" else "information")
    origin_platform = source.get("originPlatform") or ("x" if source.get("channelType") == "x" else "web")
    transport_provider = source.get("aggregator") or urlparse(source.get("endpoint", "")).hostname or "direct"
    result = {
        "sourceStream": source_stream,
        "originPlatform": origin_platform,
        "originUrl": original_url,
        "originResolution": "declared",
        "transportKind": source.get("connector") or "unknown",
        "transportProvider": transport_provider,
    }
    if origin_platform != "x":
        return result
    parsed = urlparse(original_url)
    host = (parsed.hostname or "").lower()
    parts = [part for part in parsed.path.split("/") if part]
    if host not in {"x.com", "www.x.com", "twitter.com", "www.twitter.com"} or len(parts) < 3 or parts[1] != "status" or not parts[2].isdigit():
        raise ValueError(f"X source returned an item without a canonical status URL: {original_url}")
    expected_handle = str(source.get("channelIdentifier") or "").lstrip("@").lower()
    actual_handle = parts[0].lstrip("@").lower()
    if not expected_handle or actual_handle != expected_handle:
        raise ValueError(f"X item account @{actual_handle} does not match registered account @{expected_handle}.")
    result.update({
        "originAccount": expected_handle,
        "originContentId": f"x:status:{parts[2]}",
        "originUrl": f"https://x.com/{actual_handle}/status/{parts[2]}",
        "originResolution": "verified",
    })
    return result


def document(source: dict, url, title, content="", published_at="", author="") -> dict | None:
    original_url = as_text(url, 2048)
    original_title = as_text(title, 500)
    if not original_url or not original_title or urlparse(original_url).scheme != "https":
        return None
    original_content = as_text(plain_text(content), 48000)
    source_channel_id = as_text(source.get("id"), 180)
    content_hash = hashlib.sha256(f"{original_title}\n{original_content}".encode()).hexdigest()
    source_provenance = provenance(source, original_url)
    return {
        "idempotencyKey": hashlib.sha256(f"{source_channel_id}:{original_url}:{content_hash}".encode()).hexdigest(),
        "sourceChannelId": source_channel_id,
        "discoveryPath": f"{source.get('connector')}:{source.get('endpoint')}",
        "originalPublisher": as_text(source.get("name"), 180),
        "ownerEntity": as_text(source.get("ownerEntity"), 180) or None,
        "publisherKind": source.get("publisherKind"),
        "evidenceNature": source.get("evidenceNature"),
        "classificationConfidence": source.get("classificationConfidence"),
        "originalAuthor": as_text(author, 180) or None,
        "sourceRole": source_role(source),
        "originalUrl": original_url,
        "originalPublishedAt": as_text(published_at, 64) or None,
        "fetchedAt": now_iso(),
        "originalLanguage": as_text(source.get("primaryLanguage") or source.get("language") or "unknown", 32),
        "originalTitle": original_title,
        "originalContent": original_content or None,
        "contentCompleteness": {
            "feed-content": "excerpt",
            "structured-data": "metadata",
            "metadata": "metadata",
            "excerpt": "excerpt",
            "fulltext": "fulltext",
            "transcript": "transcript",
        }.get(source.get("contentCapability"), "metadata"),
        "contentHash": content_hash,
        **source_provenance,
    }


def request_headers(url: str, accept: str) -> dict[str, str]:
    headers = {"Accept": accept, "User-Agent": USER_AGENT}
    token = os.environ.get("GITHUB_TOKEN")
    if urlparse(url).hostname == "api.github.com":
        headers["X-GitHub-Api-Version"] = "2022-11-28"
        if token:
            headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_bytes(url: str, accept: str = "application/json") -> bytes:
    validate_public_https_url(url)
    request = Request(url, headers=request_headers(url, accept))
    with _public_opener.open(request, timeout=TIMEOUT_SECONDS) as response:
        payload = response.read(MAX_UPSTREAM_BYTES + 1)
        if len(payload) > MAX_UPSTREAM_BYTES:
            raise ValueError(f"Upstream response exceeds {MAX_UPSTREAM_BYTES} bytes.")
        return payload


def fetch_json(url: str):
    return json.loads(fetch_bytes(url).decode("utf-8"))


def collect_rss(source: dict, start: datetime, end: datetime) -> list[dict]:
    import feedparser

    feed_url = source["endpoint"]
    parsed = feedparser.parse(fetch_bytes(feed_url, "application/atom+xml, application/rss+xml, application/feed+json, application/xml, text/xml"))
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"Feed parser rejected {feed_url}: {parsed.bozo_exception}")
    results = []
    for entry in parsed.entries[:MAX_ITEMS_PER_SOURCE]:
        published_struct = entry.get("published_parsed") or entry.get("updated_parsed")
        published = datetime.fromtimestamp(calendar.timegm(published_struct), timezone.utc) if published_struct else None
        if not in_window(published, start, end):
            continue
        contents = entry.get("content") or ()
        content = contents[0].get("value", "") if contents else entry.get("summary", "")
        item = document(
            source,
            entry.get("link"),
            entry.get("title"),
            content,
            now_iso(published) if published else "",
            entry.get("author", ""),
        )
        if item:
            results.append(item)
    return results


def collect_hackernews(source: dict, start: datetime, end: datetime) -> list[dict]:
    ids = fetch_json(source["endpoint"])
    ids = ids[:MAX_ITEMS_PER_SOURCE] if isinstance(ids, list) else []
    with ThreadPoolExecutor(max_workers=min(8, len(ids) or 1)) as pool:
        values = list(pool.map(lambda item_id: fetch_json(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json"), ids))
    results = []
    for value in values:
        if not isinstance(value, dict):
            continue
        published = datetime.fromtimestamp(value["time"], timezone.utc) if value.get("time") else None
        if not in_window(published, start, end):
            continue
        item = document(
            source,
            value.get("url") or f"https://news.ycombinator.com/item?id={value.get('id')}",
            value.get("title"),
            value.get("text", ""),
            now_iso(published) if published else "",
            value.get("by", ""),
        )
        if item:
            results.append(item)
    return results


def candidate_values(payload) -> list:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("items", "data", "articles", "repositories", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            for nested_key in ("items", "rows", "list"):
                if isinstance(value.get(nested_key), list):
                    return value[nested_key]
    return []


def collect_github(source: dict, payload, start: datetime, end: datetime) -> list[dict]:
    results = []
    for value in (payload if isinstance(payload, list) else [])[:MAX_ITEMS_PER_SOURCE]:
        if source["connector"] == "github-releases":
            title = value.get("name") or value.get("tag_name")
            url = value.get("html_url")
            content = value.get("body", "")
            published_at = value.get("published_at") or value.get("created_at")
            author = value.get("author", {}).get("login", "")
        else:
            repository = value.get("repo", {}).get("name", "")
            event_type = value.get("type", "GitHub event")
            title = f"{repository}: {event_type}" if repository else event_type
            url = f"https://github.com/{repository}" if repository else ""
            content = json.dumps(value.get("payload", {}), ensure_ascii=False)[:24000]
            published_at = value.get("created_at")
            author = value.get("actor", {}).get("login", "")
        if not in_window(published_at, start, end):
            continue
        item = document(source, url, title, content, published_at, author)
        if item:
            results.append(item)
    return results


def collect_generic(source: dict, payload, start: datetime, end: datetime) -> list[dict]:
    results = []
    for value in candidate_values(payload)[:MAX_ITEMS_PER_SOURCE]:
        if not isinstance(value, dict):
            continue
        repository = value.get("repo_name") or value.get("full_name")
        url = value.get("url") or value.get("html_url") or value.get("link")
        if not url and repository:
            url = f"https://github.com/{repository}"
        title = value.get("title") or value.get("name") or repository
        content = value.get("content") or value.get("description") or value.get("summary") or ""
        published_at = value.get("publishedAt") or value.get("published_at") or value.get("created_at") or value.get("date")
        if not in_window(published_at, start, end):
            continue
        author = value.get("author") or value.get("by") or ""
        if isinstance(author, dict):
            author = author.get("name") or author.get("login") or ""
        item = document(source, url, title, content, published_at, author)
        if item:
            results.append(item)
    return results


def trend_candidates(payload) -> list[dict]:
    results = []
    for value in candidate_values(payload)[:MAX_ITEMS_PER_SOURCE]:
        if not isinstance(value, dict):
            continue
        repository = as_text(value.get("repo_name") or value.get("full_name") or value.get("repository"), 220)
        if "/" not in repository:
            continue
        owner, name = repository.split("/", 1)
        if not owner or not name:
            continue
        delta = value.get("stars_since_yesterday") or value.get("starsToday") or value.get("current_period_stars") or 0
        results.append({"owner": owner, "name": name, "delta24": max(0, int(delta or 0))})
    return results


def collect_source(source: dict, start: datetime, end: datetime) -> tuple[list[dict], list[dict]]:
    host = urlparse(source["endpoint"]).hostname or "unknown"
    with _host_lock:
        semaphore = _host_semaphores.setdefault(host, BoundedSemaphore(PER_HOST_WORKERS))
    with semaphore:
        if source.get("connector") == "rss":
            return collect_rss(source, start, end), []
        if source.get("connector") == "hackernews":
            return collect_hackernews(source, start, end), []
        payload = fetch_json(source["endpoint"])
        if source.get("channelType") == "github-trending":
            return [], trend_candidates(payload)
        if source.get("connector") in {"github-releases", "github-user-events"}:
            return collect_github(source, payload, start, end), []
        return collect_generic(source, payload, start, end), []


def github_project(candidate: dict) -> dict:
    owner = candidate["owner"]
    name = candidate["name"]
    encoded = f"{quote(owner)}/{quote(name)}"
    repository = fetch_json(f"https://api.github.com/repos/{encoded}")
    readme = None
    try:
        readme = fetch_json(f"https://api.github.com/repos/{encoded}/readme")
    except (HTTPError, URLError, TimeoutError, ValueError):
        pass
    readme_text = ""
    if isinstance(readme, dict) and isinstance(readme.get("content"), str):
        try:
            readme_text = base64.b64decode(readme["content"]).decode("utf-8", errors="replace")
        except ValueError:
            readme_text = ""
    return {
        "githubId": int(repository["id"]),
        "owner": owner,
        "name": name,
        "canonicalUrl": f"https://github.com/{owner}/{name}",
        "description": as_text(repository.get("description"), 2000) or None,
        "readme": as_text(readme_text, 48000) or None,
        "readmeSha": as_text(readme.get("sha") if isinstance(readme, dict) else None, 120) or None,
        "license": as_text((repository.get("license") or {}).get("spdx_id"), 120) or None,
        "primaryLanguage": as_text(repository.get("language"), 120) or None,
        "stars": int(repository.get("stargazers_count") or 0),
        "forks": int(repository.get("forks_count") or 0),
        "watchers": int(repository.get("subscribers_count") or 0),
        "createdAt": repository["created_at"],
        "pushedAt": repository["pushed_at"],
        "fetchedAt": now_iso(),
        "delta24": candidate.get("delta24", 0),
        "delta7": 0,
    }


def load_bundle(path: Path) -> tuple[dict, list[dict]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sources = payload.get("sources")
    if not isinstance(sources, list):
        raise ValueError(f"Invalid source bundle: {path}")
    if any(source.get("channelType") == "youtube" or "youtube" in str(source.get("endpoint", "")).lower() or "youtu.be" in str(source.get("endpoint", "")).lower() for source in sources):
        raise ValueError("Source bundle contains a forbidden YouTube channel.")
    if any(urlparse(str(source.get("endpoint", ""))).scheme != "https" for source in sources):
        raise ValueError("Every runtime source endpoint must use HTTPS.")
    return payload, sources


def packet_size(packet: dict) -> int:
    return len(packet_payload(packet))


def packet_payload(packet: dict) -> bytes:
    return json.dumps(packet, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def build_packets(bundle_revision: str, collected_from: str, collected_until: str, generated_at: str, information: list[dict], repositories: list[dict]) -> list[dict]:
    records = [("information", item) for item in information] + [("repositories", item) for item in repositories]
    packets: list[dict] = []
    current = {"version": 2, "sourceBundleRevision": bundle_revision, "collectedFrom": collected_from, "collectedUntil": collected_until, "generatedAt": generated_at, "information": [], "repositories": []}
    for kind, record in records:
        candidate = {**current, "information": list(current["information"]), "repositories": list(current["repositories"])}
        candidate[kind].append(record)
        count = len(candidate["information"]) + len(candidate["repositories"])
        if count > MAX_BATCH_ITEMS or (count > 1 and packet_size(candidate) > MAX_PACKET_BYTES - PACKET_METADATA_RESERVE):
            packets.append(current)
            current = {"version": 2, "sourceBundleRevision": bundle_revision, "collectedFrom": collected_from, "collectedUntil": collected_until, "generatedAt": generated_at, "information": [], "repositories": [], kind: [record]}
        else:
            current = candidate
        if packet_size(current) > MAX_PACKET_BYTES:
            raise ValueError("A single normalized record exceeds VAULT2077_MAX_PACKET_BYTES.")
    if current["information"] or current["repositories"]:
        packets.append(current)
    total = len(packets)
    for index, packet in enumerate(packets, 1):
        digest = hashlib.sha256(json.dumps(packet, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
        packet["batchId"] = f"vault2077-{generated_at.replace('-', '').replace(':', '').replace('.', '').replace('T', '').replace('Z', '')}-{index:03d}of{total:03d}-{digest}"
        if packet_size(packet) > MAX_PACKET_BYTES:
            raise ValueError("Generated packet exceeds VAULT2077_MAX_PACKET_BYTES after metadata was added.")
    return packets


def signed_headers(payload: bytes, batch_id: str, secret: str, timestamp: str | None = None) -> dict[str, str]:
    sent_at = timestamp or str(int(time.time()))
    body_hash = hashlib.sha256(payload).hexdigest()
    signature_input = f"{sent_at}.{batch_id}.{body_hash}".encode()
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), signature_input, hashlib.sha256).digest()).decode().rstrip("=")
    return {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-Vault2077-Batch-Id": batch_id,
        "X-Vault2077-Timestamp": sent_at,
        "X-Vault2077-Signature": f"sha256={signature}",
    }


def send_packet(url: str, secret: str, packet: dict, payload: bytes | None = None, attempts: int = 3) -> dict:
    payload = payload or packet_payload(packet)
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, data=payload, method="POST", headers=signed_headers(payload, packet["batchId"], secret))
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            if error.code < 500 or attempt == attempts:
                raise RuntimeError(f"Domestic ingest returned HTTP {error.code}: {detail}") from error
            last_error = error
        except (URLError, TimeoutError) as error:
            last_error = error
            if attempt == attempts:
                break
        time.sleep(attempt * 2)
    raise RuntimeError(f"Domestic ingest failed after {attempts} attempts: {last_error}")


def trigger_processing(url: str, secret: str, max_batches: int) -> dict:
    payload = json.dumps({"maxBatches": max(1, min(20, max_batches))}).encode("utf-8")
    request = Request(url, data=payload, method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}", "User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=PROCESS_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        if error.code == 503:
            return {"deferred": True, "status": error.code, "detail": detail}
        raise RuntimeError(f"Domestic processor returned HTTP {error.code}: {detail}") from error


def main() -> None:
    bundle_path = Path(os.environ.get("VAULT2077_SOURCE_BUNDLE_FILE", "config/source-bundle.json"))
    output_dir = Path(os.environ.get("VAULT2077_COLLECTOR_OUTPUT_DIR", ".collector-output"))
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle, sources = load_bundle(bundle_path)
    start, end = collection_window()
    information: list[dict] = []
    candidates: list[dict] = []
    failures: list[dict] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(collect_source, source, start, end): source for source in sources}
        for future in as_completed(futures):
            source = futures[future]
            try:
                documents, projects = future.result()
                information.extend(documents)
                candidates.extend(projects)
            except Exception as error:  # one upstream never stops the other sources
                failures.append({"id": source.get("id"), "endpoint": source.get("endpoint"), "error": as_text(error, 500)})
                print(f"skip {source.get('id')}: {error}", file=sys.stderr)

    unique_candidates = {}
    for candidate in candidates:
        key = f"{candidate['owner']}/{candidate['name']}".lower()
        if key not in unique_candidates or candidate["delta24"] > unique_candidates[key]["delta24"]:
            unique_candidates[key] = candidate
    selected = sorted(unique_candidates.values(), key=lambda item: item["delta24"], reverse=True)[:MAX_TREND_PROJECTS]
    repositories = []
    with ThreadPoolExecutor(max_workers=min(8, len(selected) or 1)) as pool:
        future_projects = {pool.submit(github_project, candidate): candidate for candidate in selected}
        for future in as_completed(future_projects):
            try:
                repositories.append(future.result())
            except Exception as error:
                candidate = future_projects[future]
                failures.append({"id": f"github:{candidate['owner']}/{candidate['name']}", "error": as_text(error, 500)})

    generated_at = now_iso()
    packets = build_packets(bundle["revision"], now_iso(start), now_iso(end), generated_at, information, repositories)
    packet_files = []
    packet_payloads: dict[str, bytes] = {}
    for packet in packets:
        target = output_dir / f"{packet['batchId']}.json"
        payload = packet_payload(packet)
        target.write_bytes(payload)
        packet_payloads[packet["batchId"]] = payload
        packet_files.append(str(target))

    ingest_url = os.environ.get("VAULT2077_DOMESTIC_INGEST_URL")
    shared_secret = os.environ.get("VAULT2077_PIPELINE_SHARED_SECRET")
    receipts = []
    processing = None
    if ingest_url or shared_secret:
        if not ingest_url or not shared_secret:
            raise RuntimeError("VAULT2077_DOMESTIC_INGEST_URL and VAULT2077_PIPELINE_SHARED_SECRET must be configured together.")
        for packet in packets:
            receipts.append(send_packet(ingest_url, shared_secret, packet, packet_payloads[packet["batchId"]]))
        if os.environ.get("VAULT2077_TRIGGER_PROCESSING", "true").lower() == "true":
            process_url = os.environ.get("VAULT2077_DOMESTIC_PROCESS_URL") or f"{ingest_url.rstrip('/')}/process"
            processing = trigger_processing(process_url, shared_secret, 20)

    report = {
        "bundleRevision": bundle.get("revision"),
        "collectedFrom": now_iso(start),
        "collectedUntil": now_iso(end),
        "generatedAt": generated_at,
        "sourcesAttempted": len(sources),
        "sourcesSucceeded": len(sources) - len([failure for failure in failures if str(failure.get("id", "")).startswith("source-")]),
        "sourcesFailed": len([failure for failure in failures if str(failure.get("id", "")).startswith("source-")]),
        "information": len(information),
        "repositories": len(repositories),
        "packets": len(packets),
        "packetFiles": packet_files,
        "receipts": receipts,
        "processing": processing,
        "failures": failures,
    }
    report_path = output_dir / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("sourcesAttempted", "sourcesSucceeded", "information", "repositories", "packets", "processing")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
