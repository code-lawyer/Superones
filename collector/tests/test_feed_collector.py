import json
import unittest
from datetime import datetime, timezone

from collector.feed_collector import build_packets, collection_window, document, validate_public_https_url


class CollectorContractTests(unittest.TestCase):
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
