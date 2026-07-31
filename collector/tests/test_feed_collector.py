import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from collector.feed_collector import (
    build_packets,
    collect_dated_index,
    collect_generic,
    collect_github,
    collect_sitemap,
    collection_window,
    document,
    plain_text,
    validate_public_https_url,
)


class CollectorContractTests(unittest.TestCase):
    def test_inline_spans_preserve_word_boundaries_without_spacing_punctuation(self):
        self.assertEqual(
            plain_text("<p><span>Hello</span><span>,</span> world</p>").strip(),
            "Hello, world",
        )
        self.assertEqual(
            plain_text("<p><span>Google</span><span>Research</span></p>").strip(),
            "Google Research",
        )

    def test_collection_window_uses_latest_beijing_cutoff(self):
        start, end = collection_window(datetime(2026, 7, 22, 10, 17, tzinfo=timezone.utc), lookback_hours=6)
        self.assertEqual(start.isoformat(), "2026-07-22T04:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-07-22T10:00:00+00:00")

    def test_packets_respect_count_and_byte_limits(self):
        information = [{"id": index, "text": "x" * 20_000} for index in range(205)]
        packets = build_packets(
            "bundle-v1",
            "2026-07-22T04:00:00Z",
            "2026-07-22T10:00:00Z",
            "2026-07-22T10:17:00Z",
            information,
            [],
        )
        self.assertGreater(len(packets), 1)
        self.assertEqual(sum(len(packet["information"]) for packet in packets), 205)
        for packet in packets:
            self.assertLessEqual(len(packet["information"]) + len(packet["repositories"]), 200)
            self.assertLessEqual(len(json.dumps(packet, ensure_ascii=False, separators=(",", ":")).encode()), 1_750_000)
            self.assertRegex(packet["batchId"], r"^vault2077-")

    def test_source_capabilities_are_mapped_to_the_domestic_contract(self):
        source = {
            "id": "source-test",
            "name": "Example",
            "connector": "rss",
            "endpoint": "https://example.com/feed.xml",
            "contentCapability": "feed-content",
            "evidenceNature": "primary",
            "publisherKind": "organization",
        }
        item = document(source, "https://example.com/post", "Title", "<p>Original <strong>English</strong>.</p>")
        self.assertIsNotNone(item)
        self.assertEqual(item["contentCompleteness"], "excerpt")
        self.assertEqual(item["originalContent"], "Original English.")
        self.assertEqual(item["contentFormat"], "plain_text")

    def test_github_release_markdown_keeps_block_structure(self):
        source = {
            "id": "source-github-release",
            "name": "example/project",
            "connector": "github-releases",
            "endpoint": "https://api.github.com/repos/example/project/releases",
            "contentCapability": "fulltext",
            "evidenceNature": "primary",
            "publisherKind": "open_source_project",
        }
        item = document(
            source,
            "https://github.com/example/project/releases/tag/v1.0.0",
            "v1.0.0",
            "## Release notes\n\n- Fixed one issue\n- Added one feature\n\n```bash\nexample --version\n```",
        )
        self.assertEqual(item["contentFormat"], "markdown")
        self.assertIn("\n\n- Fixed one issue\n", item["originalContent"])
        self.assertIn("```bash\nexample --version\n```", item["originalContent"])

    def test_dated_index_keeps_paragraph_and_list_boundaries(self):
        source = {
            "id": "source-dated-index",
            "name": "Example changelog",
            "connector": "dated-index",
            "endpoint": "https://example.com/changelog",
            "homeUrl": "https://example.com/changelog",
            "contentCapability": "fulltext",
            "evidenceNature": "primary",
            "publisherKind": "organization",
        }
        payload = b"""
        <h2>July 30, 2026</h2>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
        <ul><li>First change</li><li>Second change</li></ul>
        """
        start = datetime(2026, 7, 29, tzinfo=timezone.utc)
        end = datetime(2026, 7, 31, tzinfo=timezone.utc)

        with patch("collector.feed_collector.fetch_bytes", return_value=payload):
            items = collect_dated_index(source, start, end)

        self.assertEqual(len(items), 1)
        self.assertRegex(
            items[0]["originalContent"],
            r"First paragraph\.\n{2,}Second paragraph\.\n{2,}- First change\n- Second change",
        )

    def test_sitemap_article_keeps_html_block_boundaries(self):
        source = {
            "id": "source-sitemap",
            "name": "Example articles",
            "connector": "sitemap",
            "endpoint": "https://example.com/sitemap.xml",
            "homeUrl": "https://example.com/updates/",
            "pathPrefix": "/updates/",
            "contentCapability": "fulltext",
            "evidenceNature": "primary",
            "publisherKind": "organization",
        }
        sitemap = b"""
        <urlset><url><loc>https://example.com/updates/one</loc><lastmod>2026-07-30</lastmod></url></urlset>
        """
        article = b"""
        <html><head><meta property="og:title" content="Structured update"></head>
        <body><article><p>First paragraph.</p><p>Second paragraph.</p>
        <ul><li>First change</li><li>Second change</li></ul></article></body></html>
        """
        start = datetime(2026, 7, 29, tzinfo=timezone.utc)
        end = datetime(2026, 7, 31, tzinfo=timezone.utc)

        with patch("collector.feed_collector.fetch_bytes", side_effect=[sitemap, article]):
            items = collect_sitemap(source, start, end)

        self.assertEqual(len(items), 1)
        self.assertRegex(
            items[0]["originalContent"],
            r"First paragraph\.\n{2,}Second paragraph\.\n{2,}- First change\n- Second change",
        )

    def test_generic_json_content_keeps_html_block_boundaries(self):
        source = {
            "id": "source-json",
            "name": "Example API",
            "connector": "json",
            "endpoint": "https://example.com/api/updates",
            "homeUrl": "https://example.com/updates/",
            "contentCapability": "fulltext",
            "evidenceNature": "primary",
            "publisherKind": "organization",
        }
        start = datetime(2026, 7, 29, tzinfo=timezone.utc)
        end = datetime(2026, 7, 31, tzinfo=timezone.utc)
        items = collect_generic(source, {"items": [{
            "title": "Structured API update",
            "url": "https://example.com/updates/api",
            "content": "<p>First paragraph.</p><p>Second paragraph.</p><ul><li>First change</li><li>Second change</li></ul>",
            "published_at": "2026-07-30T00:00:00Z",
        }]}, start, end)

        self.assertEqual(len(items), 1)
        self.assertRegex(
            items[0]["originalContent"],
            r"First paragraph\.\n{2,}Second paragraph\.\n{2,}- First change\n- Second change",
        )

    def test_routine_nightly_release_is_not_admitted_to_information(self):
        source = {
            "id": "source-github-release",
            "name": "example/project",
            "connector": "github-releases",
            "endpoint": "https://api.github.com/repos/example/project/releases",
            "contentCapability": "fulltext",
            "evidenceNature": "primary",
            "publisherKind": "open_source_project",
        }
        start = datetime(2026, 7, 30, tzinfo=timezone.utc)
        end = datetime(2026, 8, 1, tzinfo=timezone.utc)
        releases = [{
            "name": "Nightly",
            "tag_name": "nightly",
            "html_url": "https://github.com/example/project/releases/tag/nightly",
            "body": "Routine build.",
            "published_at": "2026-07-31T00:00:00Z",
            "author": {"login": "bot"},
        }]
        self.assertEqual(collect_github(source, releases, start, end), [])

    def test_x_statement_records_verified_root_identity_separately_from_rss_transport(self):
        source = {
            "id": "source-x",
            "name": "Example Person",
            "channelType": "x",
            "channelIdentifier": "ExamplePerson",
            "sourceStream": "roadside",
            "contentGroup": "roadside",
            "originPlatform": "x",
            "connector": "rss",
            "aggregator": "api.xgo.ing",
            "endpoint": "https://api.xgo.ing/rss/user/token",
            "contentCapability": "excerpt",
            "evidenceNature": "social_community",
            "publisherKind": "person",
        }
        item = document(
            source,
            "https://twitter.com/exampleperson/status/123456789?ref=rss",
            "Statement",
            "The actual statement. 🔗 View on Twitter 💬15🔄8❤️70 ⚡ Powered by xgo.ing",
        )
        self.assertEqual(item["sourceStream"], "roadside")
        self.assertEqual(item["contentGroup"], "roadside")
        self.assertEqual(item["originPlatform"], "x")
        self.assertEqual(item["originAccount"], "exampleperson")
        self.assertEqual(item["originContentId"], "x:status:123456789")
        self.assertEqual(item["originUrl"], "https://x.com/exampleperson/status/123456789")
        self.assertEqual(item["originResolution"], "verified")
        self.assertEqual(item["transportKind"], "rss")
        self.assertEqual(item["transportProvider"], "api.xgo.ing")
        self.assertEqual(item["originalContent"], "The actual statement.")

    def test_x_statement_rejects_an_item_from_another_account(self):
        source = {
            "id": "source-x",
            "name": "Expected",
            "channelType": "x",
            "channelIdentifier": "expected",
            "sourceStream": "roadside",
            "originPlatform": "x",
            "connector": "rss",
            "endpoint": "https://api.xgo.ing/rss/user/token",
        }
        with self.assertRaises(ValueError):
            document(source, "https://x.com/different/status/123456789", "Wrong account")

    def test_upstream_network_gate_rejects_non_https_and_private_hosts(self):
        with self.assertRaises(ValueError):
            validate_public_https_url("http://example.com/feed.xml")
        with self.assertRaises(ValueError):
            validate_public_https_url("https://127.0.0.1/feed.xml")

if __name__ == "__main__":
    unittest.main()
