#!/usr/bin/env python3
"""
SA Intranet - small office web server.

Serves this folder as a website and saves everyone's changes to data.json.
Standard library only (Python 3.8+), nothing to install.

    python server.py               -> http://<this-computer>:8080/
    python server.py --port 80     -> http://<this-computer>/

Office network only. There are no logins: anyone who can reach the
address can add, edit and delete entries.
"""
import argparse, datetime, json, mimetypes, os, re, shutil, socket, sys, threading, time, uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data.json")
SEED = os.path.join(ROOT, "data.seed.json")
BACKUPS = os.path.join(ROOT, "backups")
UPLOADS = os.path.join(ROOT, "uploads")
COLLS = ("links", "plugins", "tools", "wishes", "news", "help")
MAX_UPLOAD = 50 * 1024 * 1024
ALLOWED_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",                      # images
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt", ".md", ".csv",
    ".zip", ".dwg", ".rvt", ".rfa", ".dyn",                        # design files
    ".lsp", ".fas", ".vlx", ".dcl", ".mnl", ".cuix",               # AutoCAD
    ".gh", ".ghx", ".ghuser", ".rhp",                              # Rhino / Grasshopper
}
HIDDEN = {"server.py", "data.seed.json"}
LOCK = threading.Lock()

# Windows sometimes registers .js as "text/plain", which makes browsers refuse
# to run the page's scripts (you get a blank page). Force the right types.
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
         ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json",
         ".png": "image/png", ".html": "text/html"}
for _ext, _type in TYPES.items():
    mimetypes.add_type(_type, _ext)


# ---------------------------------------------------------------- data file
def load():
    if not os.path.exists(DATA):
        if os.path.exists(SEED):
            shutil.copy2(SEED, DATA)          # first run: start from the seed
        else:
            return {"rev": 0, **{c: [] for c in COLLS}}
    with open(DATA, encoding="utf-8") as f:
        d = json.load(f)
    for c in COLLS:
        d.setdefault(c, [])
    d.setdefault("rev", 0)
    return d


# One-time fixes for the live data.json. Each runs once, the first time the
# server starts after an update, and is then remembered in data.json "fixes".
def _fix_snydex(d):
    for l in d.get("links", []):
        if l.get("id") == "l-snydex" and l.get("description") in ("Office web app", "", None):
            l["description"] = "Snyder AI web"

CLAUDE_AI_TEXT = ("Modeless Claude assistant with local parameter editing, parameter copying, type changes, "
                  "rotation, moving/copying, wall creation and view operations.")
def _fix_claude_ai(d):
    for t in d.get("tools", []):
        if t.get("id") == "jt-ai-operator":
            t.update(description=CLAUDE_AI_TEXT, short=CLAUDE_AI_TEXT, howto="")

FIXES = [("2026-10-28-snydex-description", _fix_snydex),
         ("2026-10-28-claude-ai-text", _fix_claude_ai)]


def migrate(d):
    done = set(d.get("fixes", []))
    changed = False
    for key, fn in FIXES:
        if key not in done:
            fn(d)
            d.setdefault("fixes", []).append(key)
            changed = True
    return changed


def save(d):
    os.makedirs(BACKUPS, exist_ok=True)
    day = os.path.join(BACKUPS, "data-" + datetime.date.today().isoformat() + ".json")
    if os.path.exists(DATA) and not os.path.exists(day):
        shutil.copy2(DATA, day)               # one backup per day
    d["rev"] = int(d.get("rev", 0)) + 1
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATA)


def now_ms():
    return int(time.time() * 1000)


def apply_op(d, op):
    kind = op.get("op")
    if kind == "upsert":
        coll, item = op.get("coll"), op.get("item") or {}
        if coll not in COLLS or not isinstance(item, dict) or not item.get("id"):
            raise ValueError("bad upsert")
        item["updatedAt"] = now_ms()
        rows = d[coll]
        for i, r in enumerate(rows):
            if r.get("id") == item["id"]:
                merged = dict(r); merged.update(item); rows[i] = merged
                return
        item.setdefault("createdAt", item["updatedAt"])
        rows.append(item)
    elif kind == "delete":
        coll, rid = op.get("coll"), op.get("id")
        if coll not in COLLS:
            raise ValueError("bad delete")
        d[coll] = [r for r in d[coll] if r.get("id") != rid]
        if coll == "plugins":                 # a plugin's tools go with it
            d["tools"] = [t for t in d["tools"] if t.get("plugin") != rid]
    elif kind == "vote":
        wid, voter, on = op.get("wish"), str(op.get("voter") or "")[:64], bool(op.get("on"))
        for w in d["wishes"]:
            if w.get("id") == wid:
                v = [x for x in w.get("voters", []) if x != voter]
                if on and voter:
                    v.append(voter)
                w["voters"] = v
                return
        raise ValueError("no such request")
    elif kind == "batch":                     # several ops saved together
        for o in op.get("ops", [])[:200]:
            apply_op(d, o)
    else:
        raise ValueError("unknown op")


# ------------------------------------------------------- pyRevit folder scan
def parse_bundle(text):
    """Very small reader for pyRevit bundle.yaml: title, tooltip, author."""
    out = {}
    m = re.search(r'^title:\s*"?(.*?)"?\s*$', text, re.M)
    if m:
        out["title"] = m.group(1).replace("\\n", " ").strip()
    m = re.search(r'^tooltip:\s*>?\s*\n((?:[ \t]+.*\n?)+)', text, re.M)
    if m:
        out["tooltip"] = " ".join(l.strip() for l in m.group(1).splitlines() if l.strip())
    else:
        m = re.search(r'^tooltip:\s*"?(.*?)"?\s*$', text, re.M)
        if m:
            out["tooltip"] = m.group(1).strip()
    m = re.search(r'^author:\s*"?(.*?)"?\s*$', text, re.M)
    if m:
        out["author"] = m.group(1).strip()
    return out


def scan_extension(path, plugin_id):
    """Read every *.pushbutton in a pyRevit .extension folder."""
    path = os.path.normpath(path)
    if not path.lower().endswith(".extension") or not os.path.isdir(path):
        raise ValueError("That folder wasn't found, or it isn't a .extension folder.")
    safe_id = re.sub(r"[^a-z0-9-]+", "-", plugin_id.lower()).strip("-") or "plugin"
    icon_dir = os.path.join(ROOT, "icons", safe_id)
    os.makedirs(icon_dir, exist_ok=True)
    tools = []
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames.sort()
        name = os.path.basename(dirpath)
        if not name.endswith(".pushbutton"):
            continue
        parts = dirpath.split(os.sep)
        panel = next((p[:-6] for p in parts if p.endswith(".panel")), "")
        info = {}
        if "bundle.yaml" in filenames:
            with open(os.path.join(dirpath, "bundle.yaml"), encoding="utf-8-sig", errors="replace") as f:
                info = parse_bundle(f.read())
        folder = name[: -len(".pushbutton")]
        slug = re.sub(r"[^a-z0-9]+", "-", folder.lower()).strip("-")
        icon = ""
        if "icon.png" in filenames:
            shutil.copy2(os.path.join(dirpath, "icon.png"), os.path.join(icon_dir, slug + ".png"))
            icon = "icons/%s/%s.png" % (safe_id, slug)
        tip = info.get("tooltip", "")
        beta = tip.upper().startswith("BETA")
        tip = re.sub(r"^BETA\s*[—-]\s*", "", tip)
        short = tip.split(". ")[0].strip()
        if len(short) > 80:
            short = short[:80].rsplit(" ", 1)[0] + "…"
        tools.append({"name": info.get("title", folder), "panel": panel, "description": tip,
                      "short": short, "beta": beta, "icon": icon})
    return {"tools": tools, "panels": sorted({t["panel"] for t in tools if t["panel"]})}


# ------------------------------------------------------------------ server
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        p = self.path or ""
        if p.startswith("/api/") or p.endswith(".json") or p.endswith(".js") or p.endswith(".css") or p in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p == "/api/data":
            with LOCK:
                d = load()
            d["server"] = True
            return self.send_json(d)
        if p == "/api/scan":
            q = parse_qs(u.query)
            try:
                res = scan_extension(unquote(q.get("path", [""])[0]), q.get("plugin", ["plugin"])[0])
                return self.send_json(res)
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
        name = os.path.basename(p)
        if name in HIDDEN or name.endswith(".py") or p.startswith("/backups") or p.startswith("/.git"):
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        if u.path == "/api/op":
            if length > 4 * 1024 * 1024:
                return self.send_json({"error": "too large"}, 413)
            try:
                op = json.loads(self.rfile.read(length).decode("utf-8"))
                with LOCK:
                    d = load()
                    apply_op(d, op)
                    save(d)
                d["server"] = True
                return self.send_json(d)
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
        if u.path == "/api/upload":
            if length <= 0 or length > MAX_UPLOAD:
                return self.send_json({"error": "Files must be under 50 MB."}, 413)
            raw = unquote(parse_qs(u.query).get("name", ["file"])[0])
            base, ext = os.path.splitext(os.path.basename(raw))
            ext = ext.lower()
            if ext not in ALLOWED_EXT:
                return self.send_json({"error": "That file type isn't allowed (%s)." % ext}, 415)
            base = re.sub(r"[^A-Za-z0-9 _.-]+", "", base).strip()[:60] or "file"
            os.makedirs(UPLOADS, exist_ok=True)
            fname = "%s-%s%s" % (base.replace(" ", "_"), uuid.uuid4().hex[:6], ext)
            with open(os.path.join(UPLOADS, fname), "wb") as f:
                remaining = length
                while remaining:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    f.write(chunk); remaining -= len(chunk)
            return self.send_json({"path": "uploads/" + fname, "name": base + ext, "size": length})
        self.send_error(404)


class Server(ThreadingHTTPServer):
    # On Windows, "reuse address" lets two programs share a port silently.
    # Turn it off there so we get a clear error if 8080 is already taken.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True

    def server_bind(self):
        # Listen on IPv6 and IPv4 together, so both http://localhost (which
        # Windows treats as IPv6 ::1) and http://127.0.0.1 / 192.168.x.x work.
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
        super().server_bind()


def this_computers_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.100.1", 80))     # no data is sent; just picks the office network card
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "<this-computer's-IP>"


def main():
    ap = argparse.ArgumentParser(description="SA Intranet server")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="")
    a = ap.parse_args()
    d = load()  # creates data.json from the seed on first run
    if migrate(d):
        save(d)
    try:
        if a.host:
            srv = Server((a.host, a.port), Handler)
        else:
            try:
                Server.address_family = socket.AF_INET6
                srv = Server(("::", a.port), Handler)       # IPv6 + IPv4
            except OSError:
                Server.address_family = socket.AF_INET
                srv = Server(("0.0.0.0", a.port), Handler)  # IPv4 only
    except OSError as e:
        print("Couldn't start on port %d: %s" % (a.port, e))
        print("Something else is already using that port. Try:  python server.py --port 8090")
        input("Press Enter to close.")
        return
    ip = this_computers_ip()
    print("SA Intranet is running on THIS computer (%s), from folder:" % socket.gethostname())
    print("   " + ROOT)
    print("")
    print("   On this computer:     http://localhost:%d/" % a.port)
    print("   From other computers: http://%s:%d/" % (ip, a.port))
    print("")
    print("Keep this window open. Close it or press Ctrl+C to stop the site.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
