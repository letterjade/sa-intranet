"""Run: python -m unittest discover -s tests -v"""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("intranet_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class DiscussionsTest(unittest.TestCase):
    def setUp(self):
        self.data = {c: [] for c in server.COLLS}
        self.data.update(rev=0, plugins=[{"id": "p"}, {"id": "other"}], tools=[{"id": "tool", "plugin": "p"}, {"id": "other-tool", "plugin": "other"}])
        self.token = "a" * 64
        self.counter = 0

    def post(self, **overrides):
        self.counter += 1
        op = dict(op="feedback-post", id=format(self.counter, "032x"), plugin="p", tool="tool", author="Staff", body="A question", edit_token=self.token)
        op.update(overrides)
        server.apply_op(self.data, op)
        return self.data["feedback"][-1]

    def test_posts_replies_and_general_topics(self):
        root = self.post()
        reply = self.post(parent=root["id"], plugin="other", tool="other-tool")
        self.assertEqual((reply["plugin"], reply["tool"]), ("p", "tool"))
        self.assertIsNone(self.post(tool=None)["tool"])
        with self.assertRaises(ValueError): self.post(tool="other-tool")
        with self.assertRaises(ValueError): self.post(parent=reply["id"])
        with self.assertRaises(ValueError): self.post(author=" ")
        with self.assertRaises(ValueError): self.post(body="x" * 4001)
        with self.assertRaises(ValueError): self.post(edit_token="")

    def test_only_author_key_can_edit_delete_or_change_status(self):
        root = self.post()
        for kind in ("feedback-edit", "feedback-delete", "feedback-status"):
            before = copy.deepcopy(self.data)
            with self.assertRaises(ValueError):
                server.apply_op(self.data, dict(op=kind, id=root["id"], body="Spoof", status="Resolved", edit_token="b" * 64))
            self.assertEqual(before, self.data)
        server.apply_op(self.data, dict(op="feedback-edit", id=root["id"], body="Edited question", edit_token=self.token))
        server.apply_op(self.data, dict(op="feedback-status", id=root["id"], status="Resolved", edit_token=self.token))
        self.assertEqual((root["body"], root["status"]), ("Edited question", "Resolved"))
        reply = self.post(parent=root["id"], edit_token="b" * 64)
        server.apply_op(self.data, dict(op="feedback-delete", id=root["id"], edit_token=self.token))
        self.assertTrue(root["deleted"])
        self.assertEqual(root["body"], "")
        self.assertEqual(reply["body"], "A question")
        with self.assertRaises(ValueError): server.apply_op(self.data, dict(op="feedback-edit", id=root["id"], body="Restore", edit_token=self.token))

    def test_legacy_feedback_stays_readable_and_repliable(self):
        self.data["feedback"] = [dict(id="legacy", tool="tool", parent=None, author="Staff", body="Earlier question", createdAt=1)]
        reply = self.post(parent="legacy")
        self.assertEqual(reply["plugin"], "p")
        with self.assertRaises(ValueError): server.apply_op(self.data, dict(op="feedback-edit", id="legacy", body="Claim old post", edit_token=self.token))

    def test_generic_operations_cannot_bypass_ownership(self):
        root = self.post()
        for op in [dict(op="upsert", coll="feedback", item=dict(root, body="Bypass")), dict(op="delete", coll="feedback", id=root["id"])]:
            with self.assertRaises(ValueError): server.apply_op(self.data, op)

    def test_http_persistence_capability_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = {key: getattr(server, key) for key in ("ROOT", "DATA", "BACKUPS", "CHANGES")}
            server.ROOT = folder
            server.DATA = str(Path(folder) / "data.json")
            server.BACKUPS = str(Path(folder) / "backups")
            server.CHANGES = str(Path(folder) / "changes.jsonl")
            Path(server.DATA).write_text(json.dumps(self.data))
            http = server.Server(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True); thread.start()
            base = "http://127.0.0.1:" + str(http.server_address[1])
            def request(path, op=None):
                req = Request(base + path, data=json.dumps(op).encode() if op is not None else None, headers={"Content-Type": "application/json"})
                with urlopen(req, timeout=5) as response: return json.load(response)
            try:
                self.assertIn("plugin-discussions-v2", request("/api/data")["capabilities"])
                op = dict(op="feedback-post", id="c" * 32, plugin="p", tool="tool", author="Staff", body="HTTP question", edit_token=self.token)
                posted = request("/api/op", op)
                self.assertEqual(posted["feedback"][0]["body"], "HTTP question")
                self.assertIn("plugin-discussions-v2", posted["capabilities"])
                self.assertNotIn(self.token, json.dumps(posted))
                self.assertNotIn(self.token, Path(server.CHANGES).read_text())
                request("/api/op", dict(op="feedback-edit", id=op["id"], body="HTTP edit", edit_token=self.token))
                self.assertEqual(server.load()["feedback"][0]["body"], "HTTP edit")
                with self.assertRaises(HTTPError) as error:
                    request("/api/op", dict(op="feedback-delete", id=op["id"], edit_token="b" * 64))
                self.assertEqual(error.exception.code, 400)
                request("/api/op", dict(op="feedback-delete", id=op["id"], edit_token=self.token))
                self.assertTrue(server.load()["feedback"][0]["deleted"])
                self.assertTrue(list(Path(server.BACKUPS).glob("*.json")))
            finally:
                http.shutdown(); http.server_close(); thread.join()
                for key,value in paths.items(): setattr(server, key, value)


if __name__ == "__main__": unittest.main()
