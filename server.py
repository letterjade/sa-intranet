#!/usr/bin/env python3
"""
SA Intranet - small office web server.

Serves this folder as a website and saves everyone's changes to data.json.
Standard library only (Python 3.8+), nothing to install.

    python server.py               -> http://<this-computer>:8080/
    python server.py --port 80     -> http://<this-computer>/

Office network only. There are no logins: anyone who can reach the
address can add, edit and delete entries. Every change is written to
changes.jsonl, and the Admin page (#/admin, protected by a PIN kept in
admin.json) shows them and can undo them.
"""
import argparse, copy, datetime, hashlib, hmac, json, mimetypes, os, re, secrets, shutil, socket, sys, threading, time, uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data.json")
SEED = os.path.join(ROOT, "data.seed.json")
BACKUPS = os.path.join(ROOT, "backups")
UPLOADS = os.path.join(ROOT, "uploads")
CHANGES = os.path.join(ROOT, "changes.jsonl")   # one line per change, newest last
ADMIN = os.path.join(ROOT, "admin.json")        # PIN (hashed) + admin sign-ins
COLLS = ("links", "plugins", "tools", "wishes", "news", "help", "feedback")
MAX_UPLOAD = 50 * 1024 * 1024
ALLOWED_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",                      # images
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt", ".md", ".csv",
    ".zip", ".dwg", ".rvt", ".rfa", ".dyn",                        # design files
    ".lsp", ".fas", ".vlx", ".dcl", ".mnl", ".cuix",               # AutoCAD
    ".gh", ".ghx", ".ghuser", ".rhp",                              # Rhino / Grasshopper
}
HIDDEN = {"server.py", "data.seed.json", "admin.json", "changes.jsonl"}
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

def _add_office_catalog(d):
    with open(os.path.join(ROOT, "office-catalog.json"), encoding="utf-8") as f:
        catalog = json.load(f)
    for coll in ("plugins", "tools"):
        existing = {row.get("id") for row in d.setdefault(coll, [])}
        for row in catalog[coll]:
            if row["id"] not in existing:
                d[coll].append(copy.deepcopy(row))
                existing.add(row["id"])


FIXES = [("2026-10-27-rhino-voronoi", _add_office_catalog),
         ("2026-10-27-office-catalog", _add_office_catalog),
         ("2026-10-28-snydex-description", _fix_snydex),
         ("2026-10-28-claude-ai-text", _fix_claude_ai)]


def _concise_plugin_cards(d):
    updates = {
    "jadetools": {
        "description": "AI assistance, automatic annotation cleanup and everyday Revit tools.",
        "location": "S:\\CADResources\\Revit\\SA Library\\2026 Revit Automation PluginTool\\JadeTools.extension"
    },
    "jadetools-autocad": {
        "name": "Jade Drafting Tools",
        "description": "Measure rooms, update area labels and speed up AutoCAD drafting."
    },
    "snydex-details": {
        "description": "Save and reuse Revit details and sheets, and coordinate drawing references."
    },
    "adobe-library": {
        "description": "Ready-to-use Photoshop assets and Illustrator architectural graphics."
    },
    "rhino-voronoi": {
        "description": "Create Voronoi patterns and wrap them onto surfaces."
    }
}
    for plugin in d.get("plugins", []):
        if plugin.get("id") in updates:
            plugin.update(updates[plugin["id"]])


FIXES.append(("2026-10-27-concise-plugin-cards", _concise_plugin_cards))


def _snydex_public_url(d):
    for link in d.get("links", []):
        if link.get("id") == "l-snydex":
            link["url"] = "https://snydex.ca/"


FIXES.append(("2026-10-27-snydex-public-url", _snydex_public_url))


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


def _same(a, b):
    """True if two rows only differ in updatedAt."""
    strip = lambda r: {k: v for k, v in (r or {}).items() if k != "updatedAt"}
    return strip(a) == strip(b)


def apply_op(d, op, rec=None):
    """Apply one change. If rec is a list, each row it touches is added to it as
    {coll, id, before, after} (before=None: added, after=None: deleted)."""
    rec = rec if rec is not None else []
    note = lambda coll, rid, before, after: None if _same(before, after) else rec.append(
        {"coll": coll, "id": rid, "before": before, "after": copy.deepcopy(after)})
    kind = op.get("op")
    if kind == "feedback-post":
        parent_id = op.get("parent") or None
        parent = next((r for r in d["feedback"] if r.get("id") == parent_id and not r.get("parent")), None) if parent_id else None
        if parent_id and parent is None:
            raise ValueError("Discussion not found. Refresh the page.")
        tool_id = parent.get("tool") if parent else (op.get("tool") or None)
        tool = next((t for t in d["tools"] if t.get("id") == tool_id), None)
        plugin_id = (parent.get("plugin") or (tool or {}).get("plugin")) if parent else op.get("plugin")
        if not any(p.get("id") == plugin_id for p in d["plugins"]):
            raise ValueError("Plugin not found. Refresh the page.")
        if not parent and tool_id and (tool is None or tool.get("plugin") != plugin_id):
            raise ValueError("Choose an existing tool from this plugin.")
        author, body = op.get("author"), op.get("body")
        if not isinstance(author, str) or not author.strip() or len(author) > 60:
            raise ValueError("Enter your name (up to 60 characters).")
        if not isinstance(body, str) or not body.strip() or len(body) > 4000:
            raise ValueError("Enter a comment (up to 4000 characters).")
        token, rid = op.get("edit_token"), op.get("id")
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
            raise ValueError("Refresh the page to enable editing your own posts.")
        if not isinstance(rid, str) or not re.fullmatch(r"[a-f0-9]{32}", rid) or any(r.get("id") == rid for r in d["feedback"]):
            raise ValueError("Invalid or duplicate post. Refresh the page.")
        row = {"id": rid, "plugin": plugin_id, "tool": tool_id, "parent": parent_id,
               "author": author.strip(), "body": body.strip(), "createdAt": now_ms(), "status": "Open",
               "ownerHash": hashlib.sha256(token.encode("utf-8")).hexdigest()}
        d["feedback"].append(row)
        note("feedback", row["id"], None, row)
    elif kind in ("feedback-edit", "feedback-delete", "feedback-status"):
        row = next((r for r in d["feedback"] if r.get("id") == op.get("id")), None)
        if row is None or row.get("deleted"):
            raise ValueError("Post not found or already deleted.")
        token = op.get("edit_token")
        if not isinstance(token, str) or not row.get("ownerHash") or not hmac.compare_digest(row["ownerHash"], hashlib.sha256(token.encode("utf-8")).hexdigest()):
            raise ValueError("Only the original browser that posted this comment can edit or delete it.")
        before = copy.deepcopy(row)
        if kind == "feedback-delete":
            row.update(deleted=True, body="", author="", updatedAt=now_ms())
        elif kind == "feedback-status":
            status = op.get("status")
            if row.get("parent") or status not in ("Open", "In progress", "Resolved"):
                raise ValueError("Invalid discussion status.")
            row.update(status=status, updatedAt=now_ms())
        else:
            body = op.get("body")
            if not isinstance(body, str) or not body.strip() or len(body) > 4000:
                raise ValueError("Enter a comment (up to 4000 characters).")
            row.update(body=body.strip(), updatedAt=now_ms())
        note("feedback", row["id"], before, row)
    elif kind == "upsert":
        coll, item = op.get("coll"), op.get("item") or {}
        if coll not in COLLS or coll == "feedback" or not isinstance(item, dict) or not item.get("id"):
            raise ValueError("bad upsert")
        item["updatedAt"] = now_ms()
        rows = d[coll]
        for i, r in enumerate(rows):
            if r.get("id") == item["id"]:
                merged = dict(r); merged.update(item); rows[i] = merged
                note(coll, item["id"], copy.deepcopy(r), merged)
                return
        item.setdefault("createdAt", item["updatedAt"])
        rows.append(item)
        note(coll, item["id"], None, item)
    elif kind == "delete":
        coll, rid = op.get("coll"), op.get("id")
        if coll not in COLLS or coll == "feedback":
            raise ValueError("bad delete")
        for r in d[coll]:
            if r.get("id") == rid:
                note(coll, rid, copy.deepcopy(r), None)
        d[coll] = [r for r in d[coll] if r.get("id") != rid]
        if coll == "plugins":                 # a plugin's tools go with it
            for t in d["tools"]:
                if t.get("plugin") == rid:
                    note("tools", t.get("id"), copy.deepcopy(t), None)
            d["tools"] = [t for t in d["tools"] if t.get("plugin") != rid]
    elif kind == "vote":
        wid, voter, on = op.get("wish"), str(op.get("voter") or "")[:64], bool(op.get("on"))
        for w in d["wishes"]:
            if w.get("id") == wid:
                before = copy.deepcopy(w)
                v = [x for x in w.get("voters", []) if x != voter]
                if on and voter:
                    v.append(voter)
                w["voters"] = v
                note("wishes", wid, before, w)
                return
        raise ValueError("no such request")
    elif kind == "batch":                     # several ops saved together
        for o in op.get("ops", [])[:200]:
            apply_op(d, o, rec)
    else:
        raise ValueError("unknown op")


def put_row(d, coll, rid, row):
    """Set a row exactly (row=None removes it). Used by Undo and Restore."""
    rows = [r for r in d.get(coll, []) if r.get("id") != rid]
    if row is not None:
        old = next((i for i, r in enumerate(d.get(coll, [])) if r.get("id") == rid), None)
        rows.insert(old if old is not None else len(rows), row)
    d[coll] = rows


# --------------------------------------------------------------- change log
LOG_LOCK = threading.Lock()
PC_NAMES = {}                                  # ip -> computer name (looked up in the background)


def client_ip(handler):
    ip = handler.client_address[0]
    return ip[7:] if ip.startswith("::ffff:") else ip


def computer_name(ip):
    if ip in ("127.0.0.1", "::1"):
        return "this computer (" + socket.gethostname() + ")"
    if ip not in PC_NAMES:
        PC_NAMES[ip] = ""
        def look():
            try:
                PC_NAMES[ip] = socket.gethostbyaddr(ip)[0].split(".")[0].upper()
            except Exception:
                pass
        threading.Thread(target=look, daemon=True).start()
    return PC_NAMES.get(ip, "")


def log_change(entry, ip):
    entry = {"id": uuid.uuid4().hex[:10], "t": now_ms(), "ip": ip, "pc": computer_name(ip), **entry}
    with LOG_LOCK:
        with open(CHANGES, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def read_log():
    if not os.path.exists(CHANGES):
        return []
    out = []
    with LOG_LOCK:
        with open(CHANGES, encoding="utf-8") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    return out


# ------------------------------------------------------------------ admin PIN
FAILS = {}                                     # ip -> [count, first-fail time]


def admin_cfg():
    try:
        with open(ADMIN, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def admin_save(cfg):
    tmp = ADMIN + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=1)
    os.replace(tmp, ADMIN)


def pin_hash(pin, salt):
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), bytes.fromhex(salt), 120000).hex()


def token_hash(tok):
    return hashlib.sha256(tok.encode("utf-8")).hexdigest()


def new_token(cfg, days):
    tok = secrets.token_urlsafe(24)
    now = now_ms()
    toks = {k: v for k, v in cfg.get("tokens", {}).items() if v > now}
    toks[token_hash(tok)] = now + int(days * 86400000)
    cfg["tokens"] = toks
    admin_save(cfg)
    return tok


def is_admin(handler):
    tok = handler.headers.get("X-Admin-Token") or ""
    exp = admin_cfg().get("tokens", {}).get(token_hash(tok)) if tok else None
    return bool(exp and exp > now_ms())


def where_used(d, path):
    """Which request / plugin / post points at an uploaded file."""
    out = []
    labels = {"wishes": "Request", "plugins": "Plugin", "tools": "Tool", "news": "Post", "help": "Help request", "links": "Shortcut"}
    for coll, label in labels.items():
        for r in d.get(coll, []):
            if path in json.dumps(r, ensure_ascii=False):
                out.append({"coll": coll, "id": r.get("id"), "label": label, "title": r.get("title") or r.get("name") or r.get("id")})
    return out


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
            d["capabilities"] = ["plugin-discussions-v2"]
            return self.send_json(d)
        if p == "/api/scan":
            q = parse_qs(u.query)
            try:
                res = scan_extension(unquote(q.get("path", [""])[0]), q.get("plugin", ["plugin"])[0])
                return self.send_json(res)
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
        if p.startswith("/api/admin/"):
            return self.admin_get(p[len("/api/admin/"):], parse_qs(u.query))
        name = os.path.basename(p)
        if name in HIDDEN or name.endswith(".py") or p.startswith("/backups") or p.startswith("/.git") or name.endswith((".jsonl", ".tmp")):
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
                rec = []
                with LOCK:
                    d = load()
                    apply_op(d, op, rec)
                    save(d)
                if rec:
                    log_change({"kind": "change", "changes": rec}, client_ip(self))
                d["server"] = True
                d["capabilities"] = ["plugin-discussions-v2"]
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
            log_change({"kind": "upload", "file": "uploads/" + fname, "name": base + ext, "size": length}, client_ip(self))
            return self.send_json({"path": "uploads/" + fname, "name": base + ext, "size": length})
        if u.path.startswith("/api/admin/"):
            if length > 1024 * 1024:
                return self.send_json({"error": "too large"}, 413)
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except ValueError:
                return self.send_json({"error": "bad request"}, 400)
            return self.admin_post(u.path[len("/api/admin/"):], body)
        self.send_error(404)

    # ------------------------------------------------------------ admin
    def admin_get(self, what, q):
        if not is_admin(self):
            return self.send_json({"error": "Enter the admin PIN."}, 401)
        if what == "log":
            entries = read_log()
            undone = {e.get("of") for e in entries if e.get("kind") == "undo"}
            for e in entries:
                e["undone"] = e["id"] in undone
                if not e.get("pc") and e.get("ip"):
                    e["pc"] = computer_name(e["ip"])
            limit = min(int(q.get("limit", ["400"])[0] or 400), 5000)
            return self.send_json({"entries": entries[-limit:][::-1], "total": len(entries)})
        if what == "files":
            with LOCK:
                d = load()
            files = []
            if os.path.isdir(UPLOADS):
                for n in sorted(os.listdir(UPLOADS)):
                    fp = os.path.join(UPLOADS, n)
                    if n.startswith(".") or not os.path.isfile(fp):
                        continue
                    st = os.stat(fp)
                    files.append({"name": n, "path": "uploads/" + n, "size": st.st_size, "t": int(st.st_mtime * 1000), "usedBy": where_used(d, "uploads/" + n)})
            du = shutil.disk_usage(ROOT)
            return self.send_json({"files": files, "folder": UPLOADS, "disk": {"total": du.total, "free": du.free}})
        if what == "backups":
            out = []
            if os.path.isdir(BACKUPS):
                for n in sorted(os.listdir(BACKUPS), reverse=True):
                    if n.endswith(".json"):
                        st = os.stat(os.path.join(BACKUPS, n))
                        out.append({"name": n, "size": st.st_size, "t": int(st.st_mtime * 1000)})
            return self.send_json({"backups": out})
        return self.send_json({"error": "unknown"}, 404)

    def admin_post(self, what, body):
        ip = client_ip(self)
        cfg = admin_cfg()
        if what == "status":
            return self.send_json({"hasPin": bool(cfg.get("pin")), "ok": is_admin(self)})
        if what in ("setup", "login"):
            pin = str(body.get("pin") or "")
            days = 30 if body.get("remember") else 0.5
            if what == "setup":
                if cfg.get("pin"):
                    return self.send_json({"error": "A PIN is already set."}, 400)
                if not re.fullmatch(r"\d{4,12}", pin):
                    return self.send_json({"error": "Use 4 to 12 numbers."}, 400)
                salt = secrets.token_hex(16)
                cfg = {"salt": salt, "pin": pin_hash(pin, salt), "tokens": {}}
                return self.send_json({"token": new_token(cfg, days)})
            n, first = FAILS.get(ip, [0, 0])
            if n >= 8 and time.time() - first < 300:
                return self.send_json({"error": "Too many wrong tries. Wait 5 minutes."}, 429)
            if not cfg.get("pin") or not hmac.compare_digest(pin_hash(pin, cfg["salt"]), cfg["pin"]):
                FAILS[ip] = [n + 1, first if n and time.time() - first < 300 else time.time()]
                time.sleep(0.8)
                return self.send_json({"error": "That PIN isn't right."}, 403)
            FAILS.pop(ip, None)
            return self.send_json({"token": new_token(cfg, days)})
        if not is_admin(self):
            return self.send_json({"error": "Enter the admin PIN."}, 401)
        if what == "logout":
            tok = self.headers.get("X-Admin-Token") or ""
            cfg.get("tokens", {}).pop(token_hash(tok), None)
            admin_save(cfg)
            return self.send_json({"ok": True})
        if what == "pin":
            pin = str(body.get("pin") or "")
            if not re.fullmatch(r"\d{4,12}", pin):
                return self.send_json({"error": "Use 4 to 12 numbers."}, 400)
            cfg["salt"] = secrets.token_hex(16)
            cfg["pin"] = pin_hash(pin, cfg["salt"])
            cfg["tokens"] = {}
            return self.send_json({"token": new_token(cfg, 30 if body.get("remember") else 0.5)})
        if what == "undo":
            entry = next((e for e in read_log() if e.get("id") == body.get("id")), None)
            if not entry or entry.get("kind") != "change":
                return self.send_json({"error": "That change wasn't found."}, 404)
            with LOCK:
                d = load()
                for c in reversed(entry["changes"]):
                    if c["coll"] in COLLS:
                        put_row(d, c["coll"], c["id"], c["before"])
                save(d)
            log_change({"kind": "undo", "of": entry["id"], "changes": [{"coll": c["coll"], "id": c["id"], "before": c["after"], "after": c["before"]} for c in entry["changes"]]}, ip)
            d["server"] = True
            d["capabilities"] = ["plugin-discussions-v2"]
            return self.send_json(d)
        if what == "delete-file":
            name = os.path.basename(str(body.get("name") or ""))
            fp = os.path.join(UPLOADS, name)
            if not name or name.startswith(".") or not os.path.isfile(fp):
                return self.send_json({"error": "File not found."}, 404)
            size = os.path.getsize(fp)
            os.remove(fp)
            log_change({"kind": "delete-file", "file": "uploads/" + name, "name": name, "size": size}, ip)
            return self.send_json({"ok": True})
        if what == "restore":
            name = os.path.basename(str(body.get("name") or ""))
            fp = os.path.join(BACKUPS, name)
            if not name.endswith(".json") or not os.path.isfile(fp):
                return self.send_json({"error": "Backup not found."}, 404)
            with LOCK:
                with open(fp, encoding="utf-8") as f:
                    restored = json.load(f)
                keep = os.path.join(BACKUPS, "before-restore-" + datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S") + ".json")
                shutil.copy2(DATA, keep)
                restored["rev"] = load().get("rev", 0)
                save(restored)
            log_change({"kind": "restore", "name": name, "saved": os.path.basename(keep)}, ip)
            return self.send_json({"ok": True})
        return self.send_json({"error": "unknown"}, 404)


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
