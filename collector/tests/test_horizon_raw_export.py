import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from collector.horizon_raw_export import (
    collect_one,
    repair_utf8_mojibake,
    selected_sources,
)


class HorizonRawExportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.public_url_guard = patch("collector.horizon_raw_export.validate_public_https_url")
        self.public_url_guard.start()

    def tearDown(self):
        self.public_url_guard.stop()

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
            information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

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
            information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(information, [])
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
            information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(calls, 2)
        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)

    async def test_horizon_transport_rejects_an_unapproved_redirect_origin(self):
        source = {
            "id": "source-rss-redirect",
            "name": "Redirecting feed",
            "connector": "rss",
            "endpoint": "https://feeds.example.test/feed.xml",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "organization",
        }

        async def handler(request):
            if request.url.host == "feeds.example.test":
                return httpx.Response(302, headers={"location": "https://private.example.test/feed.xml"})
            self.fail("The client followed an unapproved redirect.")

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(information, [])
        self.assertEqual(outcome.status, "failure")
        self.assertIn("not approved", outcome.error)

    async def test_hacker_news_external_story_is_a_canonical_community_topic_without_recursive_fetch(self):
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
                information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalUrl"], "https://news.ycombinator.com/item?id=101")
        self.assertEqual(information[0]["externalUrl"], "https://publisher.example.test/story")
        self.assertEqual(information[0]["contentGroup"], "roadside")
        self.assertEqual(information[0]["publisherKind"], "community")
        self.assertEqual(information[0]["provenanceStatus"], "verified")
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
                information, _ = await collect_one(source, start, end, client, asyncio.Semaphore(1))
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["contentGroup"], "roadside")
        self.assertEqual(information[0]["itemKind"], "community_topic")
        self.assertEqual(information[0]["publisherKind"], "community")
        self.assertEqual(information[0]["originalAuthor"], "community-name")
        self.assertNotIn("203", information[0]["originalContent"])

    async def test_lobsters_external_story_keeps_the_discussion_as_canonical(self):
        source = {
            "id": "source-lobsters-test",
            "name": "Lobsters",
            "connector": "json",
            "channelIdentifier": "lobsters",
            "endpoint": "https://lobste.rs/hottest.json",
            "contentGroup": "roadside",
            "primaryLanguage": "en",
            "contentCapability": "metadata",
            "evidenceNature": "social_community",
            "publisherKind": "community",
            "classificationConfidence": "high",
        }
        payload = [{
            "short_id": "abc123",
            "title": "A systems story",
            "url": "https://publisher.example.test/story",
            "comments_url": "https://lobste.rs/s/abc123/systems_story",
            "created_at": "2026-07-22T09:00:00Z",
            "submitter_user": {"username": "lobster"},
        }]
        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        with patch("collector.feed_collector.fetch_json", return_value=payload):
            async with httpx.AsyncClient() as client:
                information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalUrl"], "https://lobste.rs/s/abc123/systems_story")
        self.assertEqual(information[0]["externalUrl"], "https://publisher.example.test/story")
        self.assertEqual(information[0]["provenanceRole"], "canonical")

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
                information, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(outcome.status, "success")
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalTitle"], "example/project released v1.0.0")


if __name__ == "__main__":
    unittest.main()
