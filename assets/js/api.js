// ---------------------------------------------------------------------------
// Data layer. Talks to server.py (/api/data, /api/op, /api/upload, /api/scan).
// If server.py isn't running (plain file hosting), the page reads data.json
// read-only and saves nothing.
// ---------------------------------------------------------------------------
export const state = { mode: "loading", data: emptyData() };

function emptyData() {
  return { rev: 0, links: [], plugins: [], tools: [], wishes: [], news: [], help: [], feedback: [] };
}
function setData(d) {
  const { server, ...rest } = d || {};
  state.data = { ...emptyData(), ...rest };
}

export async function load() {
  try {
    const r = await fetch("api/data", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); if (d && d.server) { state.mode = "server"; setData(d); return; } }
  } catch (e) { /* fall through */ }
  try {
    let r = await fetch("data.json", { cache: "no-store" });
    if (!r.ok) r = await fetch("data.seed.json", { cache: "no-store" });
    if (r.ok) { state.mode = "readonly"; setData(await r.json()); return; }
  } catch (e) { /* fall through */ }
  state.mode = "offline";
}

export const canEdit = () => state.mode === "server";

async function post(url, body, headers) {
  const r = await fetch(url, { method: "POST", headers, body });
  const d = await r.json().catch(() => ({ error: "The server didn't answer." }));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

/** Save one change: {op:"upsert"|"delete"|"vote"|"batch", ...} */
export async function send(op) {
  if (!canEdit()) throw new Error("Saving needs the SA Intranet server (server.py) to be running.");
  const d = await post("api/op", JSON.stringify(op), { "Content-Type": "application/json" });
  setData(d);
  listeners.forEach(fn => fn());
}
export const upsert = (coll, item) => send({ op: "upsert", coll, item });
export const remove = (coll, id) => send({ op: "delete", coll, id });
export const batch = ops => send({ op: "batch", ops });

export async function upload(file) {
  if (!canEdit()) throw new Error("Uploading needs the SA Intranet server.");
  return post("api/upload?name=" + encodeURIComponent(file.name), file);
}

export async function scanExtension(path, pluginId) {
  const r = await fetch("api/scan?path=" + encodeURIComponent(path) + "&plugin=" + encodeURIComponent(pluginId));
  const d = await r.json().catch(() => ({ error: "The server didn't answer." }));
  if (!r.ok) throw new Error(d.error || "Couldn't read that folder.");
  return d;
}

// ---- live refresh: other people's changes appear within ~20 s ----
const listeners = [];
export function onChange(fn) { listeners.push(fn); }
setInterval(async () => {
  if (state.mode !== "server" || document.hidden) return;
  try {
    const r = await fetch("api/data", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    if (d.rev !== state.data.rev) { setData(d); listeners.forEach(fn => fn({ fromPoll: true })); }
  } catch (e) { /* ignore */ }
}, 20000);

// ---- helpers on the data ----
export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Plugins in the order they were added (Jade Cleaner first, then each new one after it).
export const pluginsInOrder = (list = state.data.plugins) => list
  .map((p, i) => [p, i]).sort(([a, i], [b, j]) => (a.createdAt || 0) - (b.createdAt || 0) || i - j).map(([p]) => p);
export const pluginById = id => state.data.plugins.find(p => p.id === id);
export const toolsOf = id => state.data.tools.filter(t => t.plugin === id)
  .sort((a, b) => (a.order ?? 1e15) - (b.order ?? 1e15) || String(a.name).localeCompare(String(b.name)));
export const activeWishes = () => state.data.wishes.filter(w => ["Open", "Planned", "In progress"].includes(w.status || "Open"));

// ---- per-computer things (no accounts): voter id, personal shortcuts, alert settings ----
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
export const local = {
  get(k, fallback) { try { const v = store(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { store(k, JSON.stringify(v)); },
};
export const voterId = (() => { let v = local.get("sa.voter"); if (!v) { v = newId("v"); local.set("sa.voter", v); } return v; })();

// ---- admin (PIN). The token is kept in this browser only. ----
export const adminToken = () => local.get("sa.adminToken", "");
export const isAdminHere = () => !!adminToken();
export async function admin(what, body) {
  const headers = { "Content-Type": "application/json", "X-Admin-Token": adminToken() };
  const r = body === undefined && !["status", "logout"].includes(what)
    ? await fetch("api/admin/" + what, { headers, cache: "no-store" })
    : await fetch("api/admin/" + what, { method: "POST", headers, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({ error: "The server didn't answer. Is it running the latest server.py?" }));
  if (r.status === 401) { local.set("sa.adminToken", ""); }
  if (!r.ok) { const e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; }
  if (d.rev !== undefined && d.links) { setData(d); listeners.forEach(fn => fn()); }
  return d;
}
