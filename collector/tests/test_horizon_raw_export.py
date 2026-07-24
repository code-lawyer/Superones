import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from collector.horizon_raw_export import collect_one, repair_utf8_mojibake, selected_sources


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

    async def test_hacker_news_keeps_story_when_comment_request_fails(self):
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

        async def handler(request):
            path = request.url.path
            if path.endswith("/topstories.json"):
                return httpx.Response(200, json=[101])
            if path.endswith("/item/101.json"):
                return httpx.Response(200, json={
                    "id": 101,
                    "title": "A real upstream story",
                    "url": "https://publisher.example.test/story",
                    "time": published,
                    "score": 200,
                    "by": "author",
                    "kids": [202],
                })
            if path.endswith("/item/202.json"):
                return httpx.Response(503, text="comment unavailable")
            self.fail(f"Unexpected request: {request.url}")

        start = datetime(2026, 7, 22, 4, tzinfo=timezone.utc)
        end = datetime(2026, 7, 22, 10, tzinfo=timezone.utc)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            information, candidates, outcome = await collect_one(source, start, end, client, asyncio.Semaphore(1))

        self.assertEqual(candidates, [])
        self.assertEqual(outcome.status, "partial")
        self.assertIn("HTTP 503", outcome.error)
        self.assertEqual(len(information), 1)
        self.assertEqual(information[0]["originalTitle"], "A real upstream story")
        self.assertEqual(information[0]["originalUrl"], "https://publisher.example.test/story")

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
