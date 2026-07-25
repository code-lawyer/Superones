import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from collector.horizon_raw_export import (
    canonical_source_for_url,
    collect_one,
    promote_discovery_candidates,
    repair_utf8_mojibake,
    selected_sources,
)


class HorizonRawExportTests(unittest.IsolatedAsyncioTestCase):
    async def test_horizon_rss_adapter_preserves_original_english_record(self):
        source = {
            "id": "source-rss-test",
            "name": "Official Example",
            "connector": "rss",
            "endpoint": "https://feeds.example.test/atom.xml",
            "primaryLanguage": "en",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "organization",
            "classificationConfidence": "high",
        }
        body = """<?xml version='1.0'?>
        <feed xmlns='http://www.w3.org/2005/Atom'>
          <title>Official Example</title>
          <entry>
            <id>tag:example.test,2026:one</id>
            <title>Real upstream headline</title>
            <link href='https://example.test/articles/one'/>
            <updated>2026-07-22T10:00:00Z</updated>
            <summary>Original English evidence from the publisher.</summary>
            <author><name>Example Author</name></author>
          </entry>
        </feed>"""

        async def handler(request):
            self.assertEqual(str(request.url), source["endpoint"])
            return httpx.Response(200, content=body.encode(), headers={"content-type": "application/atom+xml"})

        transport = httpx.MockTransport(handler)
        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        async with httpx.AsyncClient(transport=transport) as client:
            information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(candidates, [])
        self.assertEqual(outcome.adapter, "horizon-rss")
        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalTitle"], "Real upstream headline")
        self.assertIn("Original English evidence", information[0]["originalContent"])
        self.assertEqual(information[0]["originalUrl"], "https://example.test/articles/one")
        self.assertNotIn("本地演练", information[0]["originalTitle"])

    def test_source_filter_keeps_approved_bundle_unchanged(self):
        sources = [{"id": "source-one"}, {"id": "source-two"}]
        self.assertEqual(selected_sources(sources), sources)
        with patch.dict("os.environ", {"VAULT2077_SOURCE_IDS": "source-two"}):
            self.assertEqual(selected_sources(sources), [{"id": "source-two"}])

    def test_repair_utf8_mojibake_preserves_readable_original_text(self):
        self.assertEqual(repair_utf8_mojibake("Weâ€™re shipping an update"), "We’re shipping an update")
        self.assertEqual(repair_utf8_mojibake("Already readable text €100"), "Already readable text €100")

    async def test_horizon_rss_http_failure_is_not_reported_as_empty(self):
        source = {
            "id": "source-rss-failure",
            "name": "Broken official feed",
            "connector": "rss",
            "endpoint": "https://feeds.example.test/broken.xml",
            "primaryLanguage": "en",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "organization",
            "classificationConfidence": "high",
        }

        async def handler(_request):
            return httpx.Response(503, text="upstream unavailable")

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(information, [])
        self.assertEqual(candidates, [])
        self.assertEqual(outcome.status, "failure")
        self.assertIn("HTTP 503", outcome.error)

    async def test_horizon_rss_retries_a_transient_upstream_failure(self):
        source = {
            "id": "source-rss-retry",
            "name": "Recovering official feed",
            "connector": "rss",
            "endpoint": "https://feeds.example.test/recovering.xml",
            "primaryLanguage": "en",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "organization",
            "classificationConfidence": "high",
        }
        calls = 0
        body = """<?xml version='1.0'?>
        <feed xmlns='http://www.w3.org/2005/Atom'>
          <title>Recovering feed</title>
          <entry>
            <id>tag:example.test,2026:retry</id>
            <title>Recovered upstream headline</title>
            <link href='https://example.test/articles/retry'/>
            <updated>2026-07-22T10:00:00Z</updated>
            <summary>Available after one transient failure.</summary>
          </entry>
        </feed>"""

        async def handler(_request):
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(503, text="temporary failure")
            return httpx.Response(200, content=body.encode(), headers={"content-type": "application/atom+xml"})

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(calls, 2)
        self.assertEqual(candidates, [])
        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)

    async def test_hacker_news_external_story_is_discovery_only_and_never_fetches_comments(self):
        source = {
            "id": "source-hn-test",
            "name": "Hacker News",
            "connector": "hackernews",
            "endpoint": "https://hacker-news.firebaseio.com/v0/topstories.json",
            "primaryLanguage": "en",
            "contentCapability": "metadata",
            "evidenceNature": "social_community",
            "publisherKind": "community",
            "classificationConfidence": "high",
        }
        published = int(datetime(2026, 7, 22, 9, tzinfo=timezone.utc).timestamp())

        requested = []

        def upstream(url):
            requested.append(url)
            if url.endswith("/topstories.json"):
                return [101]
            if url.endswith("/item/101.json"):
                return {
                    "id": 101,
                    "title": "A real upstream story",
                    "url": "https://publisher.example.test/story",
                    "time": published,
                    "score": 200,
                    "by": "author",
                    "kids": [202],
                }
            self.fail(f"Unexpected request: {url}")

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        with patch("collector.feed_collector.fetch_json", side_effect=upstream):
            async with httpx.AsyncClient() as client:
                information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(information, [])
        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["canonicalUrl"], "https://publisher.example.test/story")
        self.assertEqual(candidates[0]["status"], "candidate")
        self.assertFalse(any("/item/202.json" in url for url in requested))

    async def test_hacker_news_native_topic_enters_roadside_without_comments(self):
        source = {
            "id": "source-hn-test",
            "name": "Hacker News",
            "connector": "hackernews",
            "endpoint": "https://hacker-news.firebaseio.com/v0/topstories.json",
            "contentGroup": "roadside",
            "primaryLanguage": "en",
            "contentCapability": "fulltext",
            "evidenceNature": "social_community",
            "publisherKind": "community_user",
            "classificationConfidence": "high",
        }
        published = int(datetime(2026, 7, 22, 9, tzinfo=timezone.utc).timestamp())

        def upstream(url):
            if url.endswith("/topstories.json"):
                return [102]
            return {
                "id": 102,
                "title": "Ask HN: How should this be built?",
                "text": "This is the topic body, not a comment.",
                "time": published,
                "by": "community-name",
                "kids": [203],
            }

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        with patch("collector.feed_collector.fetch_json", side_effect=upstream):
            async with httpx.AsyncClient() as client:
                information, candidates, _ = await collect_one(source, start, end, client, asyncio.Semaphore(1))
        self.assertEqual(candidates, [])
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["contentGroup"], "roadside")
        self.assertEqual(information[0]["itemKind"], "community_topic")
        self.assertEqual(information[0]["publisherKind"], "community_user")
        self.assertEqual(information[0]["originalAuthor"], "community-name")
        self.assertNotIn("203", information[0]["originalContent"])

    async def test_known_discovery_domains_are_promoted_and_routed_by_original_publisher(self):
        def source(source_id, host, group, publisher_kind):
            return {
                "id": source_id,
                "name": source_id,
                "connector": "rss",
                "endpoint": f"https://{host}/feed.xml",
                "homeUrl": f"https://{host}/",
                "contentGroup": group,
                "provenanceRole": "canonical",
                "provenanceStatus": "verified",
                "originPlatform": "web",
                "primaryLanguage": "en",
                "contentCapability": "fulltext",
                "evidenceNature": "primary" if group == "documents" else "reported_analysis",
                "publisherKind": publisher_kind,
                "classificationConfidence": "high",
            }

        sources = [
            source("editorial-source", "media.example.test", "information", "editorial_media"),
            source("organization-source", "company.example.test", "documents", "organization"),
            source("person-source", "person.example.test", "roadside", "person"),
        ]
        candidates = [
            {
                "canonicalUrl": f"https://{host}/post",
                "discoveryUrl": f"https://news.ycombinator.com/item?id={index}",
                "title": "Discovery title",
                "publishedAt": "2026-07-22T09:00:00Z",
            }
            for index, host in enumerate(
                ("media.example.test", "company.example.test", "person.example.test"),
                start=1,
            )
        ]
        candidates.append({
            "canonicalUrl": "https://unknown.example.test/post",
            "discoveryUrl": "https://news.ycombinator.com/item?id=4",
            "title": "Unknown publisher",
            "publishedAt": "2026-07-22T09:00:00Z",
        })
        body = """
        <html><head>
          <meta property="og:title" content="Canonical original title">
          <meta property="article:published_time" content="2026-07-22T09:00:00Z">
          <meta name="author" content="Original Author">
        </head><body><article>
          This is the complete original publisher document. It contains enough
          substantive text to pass full-text admission and is not a community comment.
          The original publisher remains responsible for this complete document.
        </article></body></html>
        """

        async def handler(request):
            return httpx.Response(200, text=body, request=request)

        with patch("collector.horizon_raw_export.validate_public_https_url"):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                promoted, discoveries, stats = await promote_discovery_candidates(candidates, sources, client)

        self.assertEqual([item["contentGroup"] for item in promoted], ["information", "documents", "roadside"])
        self.assertTrue(all(item["contentCompleteness"] == "fulltext" for item in promoted))
        self.assertTrue(all("community comment" in item["originalContent"] for item in promoted))
        self.assertEqual({item["sourceChannelId"] for item in promoted}, set(stats))
        self.assertEqual(sum(item["status"] == "promoted" for item in discoveries), 3)
        self.assertEqual(discoveries[-1]["status"], "candidate")
        self.assertIsNone(canonical_source_for_url("https://unknown.example.test/post", sources))

    async def test_github_adapter_sends_configured_read_token(self):
        source = {
            "id": "source-github-test",
            "name": "Example releases",
            "connector": "github-releases",
            "channelIdentifier": "example/project",
            "primaryLanguage": "en",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "open_source_project",
            "classificationConfidence": "high",
        }

        async def handler(request):
            self.assertEqual(request.headers.get("authorization"), "token test-read-token")
            self.assertEqual(request.url.path, "/repos/example/project/releases")
            return httpx.Response(200, json=[{
                "id": 1,
                "tag_name": "v1.0.0",
                "html_url": "https://github.com/example/project/releases/tag/v1.0.0",
                "body": "Real release notes.",
                "author": {"login": "example"},
                "published_at": "2026-07-22T09:00:00Z",
                "prerelease": False,
            }])

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        with patch.dict("os.environ", {"GITHUB_TOKEN": "test-read-token"}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(candidates, [])
        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalTitle"], "example/project released v1.0.0")


if __name__ == "__main__":
    unittest.main()
