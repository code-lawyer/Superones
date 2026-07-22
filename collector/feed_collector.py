"""Collect only human-approved public RSS/Atom/JSON feeds outside mainland China.

The script emits a constrained JSON array for scripts/overseas-collector.mjs;
it never sends feed credentials, browser state, or user data to Vault2077.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from reader import make_reader


def as_text(value, limit):
    if value is None:
        return ""
    return " ".join(str(value).split())[:limit]


def main():
    allowlist_path = Path(os.environ.get("VAULT2077_FEED_ALLOWLIST_FILE", "config/feed-sources.json"))
    output_path = Path(os.environ.get("VAULT2077_RSS_DOCUMENTS_FILE", ".collector-rss.json"))
    inline_allowlist = os.environ.get("VAULT2077_FEED_ALLOWLIST_JSON")
    if inline_allowlist:
        sources = json.loads(inline_allowlist)
    elif allowlist_path.exists():
        sources = json.loads(allowlist_path.read_text(encoding="utf-8"))
    else:
        raise SystemExit(f"Missing approved feed allowlist: {allowlist_path}")
    if not isinstance(sources, list):
        raise SystemExit("Feed allowlist must be a JSON array")

    reader = make_reader(":memory:")
    documents = []
    for source in sources:
        if not isinstance(source, dict) or source.get("approved") is not True:
            continue
        source_id = as_text(source.get("id"), 120)
        source_name = as_text(source.get("name"), 160)
        feed_url = as_text(source.get("url"), 2048)
        category = source.get("category")
        if not source_id or not source_name or not feed_url.startswith("https://"):
            continue
        reader.add_feed(feed_url, exist_ok=True)
        try:
            reader.update_feed(feed_url)
        except Exception as error:  # one upstream feed cannot stop other approved sources
            print(f"skip {source_id}: {error}")
            continue
        for entry in reader.get_entries(feed=feed_url, limit=20):
            url = as_text(entry.link, 2048)
            title = as_text(entry.title, 500)
            if not url.startswith("https://") or not title:
                continue
            published = entry.published or entry.updated or datetime.now(timezone.utc)
            content = entry.content[0].value if entry.content else entry.summary
            item = {
                "sourceId": source_id,
                "sourceName": source_name,
                "url": url,
                "title": title,
                "text": as_text(content, 24000),
                "publishedAt": published.isoformat().replace("+00:00", "Z"),
            }
            if category in {"公司公告", "人物观点", "播客", "研究文章"}:
                item["category"] = category
            documents.append(item)

    output_path.write_text(json.dumps(documents, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(documents)} approved feed records")


if __name__ == "__main__":
    main()
