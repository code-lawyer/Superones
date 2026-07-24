import hashlib
import hmac
import json
import unittest
from base64 import urlsafe_b64decode
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

from collector.feed_collector import build_packets, collection_window, document, send_packet, signed_headers, trigger_processing, validate_public_https_url


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

    def test_signature_matches_domestic_hmac_contract(self):
        payload = b'{"version":2}'
        headers = signed_headers(payload, "batch-123456", "secret-value", "1784714400")
        encoded = headers["X-Vault2077-Signature"].removeprefix("sha256=")
        supplied = urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        body_hash = hashlib.sha256(payload).hexdigest()
        expected = hmac.new(b"secret-value", f"1784714400.batch-123456.{body_hash}".encode(), hashlib.sha256).digest()
        self.assertEqual(supplied, expected)

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

    def test_upstream_network_gate_rejects_non_https_and_private_hosts(self):
        with self.assertRaises(ValueError):
            validate_public_https_url("http://example.com/feed.xml")
        with self.assertRaises(ValueError):
            validate_public_https_url("https://127.0.0.1/feed.xml")

    def test_collector_sends_exact_packet_bytes_and_triggers_domestic_worker(self):
        received = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("content-length", "0")))
                received.append((self.path, self.headers, body))
                payload = {"accepted": True} if self.path == "/ingest" else {"ok": True}
                encoded = json.dumps(payload).encode()
                self.send_response(202 if self.path == "/ingest" else 200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, _format, *_args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        packet = {"batchId": "vault2077-test-packet", "version": 2}
        exact = b'{"batchId":"vault2077-test-packet", "version":2}'
        try:
            receipt = send_packet(f"http://127.0.0.1:{server.server_port}/ingest", "shared-secret", packet, exact)
            processing = trigger_processing(f"http://127.0.0.1:{server.server_port}/process", "worker-secret", 20)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        self.assertTrue(receipt["accepted"])
        self.assertTrue(processing["ok"])
        self.assertEqual(received[0][2], exact)
        self.assertEqual(received[0][1]["X-Vault2077-Batch-Id"], packet["batchId"])
        self.assertEqual(received[1][1]["Authorization"], "Bearer worker-secret")
        self.assertEqual(json.loads(received[1][2]), {"maxBatches": 20})


if __name__ == "__main__":
    unittest.main()
