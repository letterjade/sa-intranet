// Admin (PIN only): see help requests, the wishlist, every change people made,
// uploaded files and backups — and undo or remove things.
//   #/admin            overview + help requests
//   #/admin/wishlist   #/admin/activity   #/admin/files   #/admin/backups   #/admin/settings
import { h, renderTopbar, renderBanner, toast, when, sw, img, icon } from "../ui.js";
import { state, canEdit, admin, adminToken, local, upsert, batch, pluginById } from "../api.js";

const TABS = [["help", "Help requests"], ["wishlist", "Wishlist"], ["activity", "Everything that changed"], ["files", "Uploaded files"], ["backups", "Backups"], ["settings", "PIN & sign out"]];
const cache = { rev: null, log: null, files: null, backups: null };
let seenBefore = null;                 // last visit, so "New" marks survive this visit
let actFilter = "all", showVotes = false, openDetail = null, showDoneHelp = false;

export function render(root, tab = "help") {
  if (!TABS.some(([k]) => k === tab)) tab = "help";
  renderTopbar("Admin");
  if (!canEdit()) { renderBanner(h("div", { class: "grow" }, h("h1", { text: "Admin" }))); root.replaceChildren(h("div", { class: "wrap page" }, h("p", { class: "bad-box", text: "Admin needs the Snyder Hub server to be running." }))); return; }
  if (!adminToken()) return lockScreen(root);
  if (seenBefore === null) { seenBefore = local.get("sa.adminSeen", 0); local.set("sa.adminSeen", Date.now()); }

  renderBanner(h("div", { class: "grow" }, h("h1", { text: "Admin" }), h("p", { class: "sub", text: "Only on this computer, with your PIN. See what people added or changed, and undo or remove it." })),
    h("div", { class: "actions" }, h("button", { class: "btn on-dark", type: "button", onclick: () => { cache.rev = null; render(root, tab); } }, "Refresh")));

  const body = h("div", { class: "admin-body" }, h("p", { class: "empty", text: "Loading…" }));
  root.replaceChildren(h("div", { class: "wrap page stack", style: "gap:1.4rem" }, stats(), tabsRow(tab), body));
  fetchAll().then(() => {
    body.replaceChildren(...[({ help: helpTab, wishlist: wishTab, activity: activityTab, files: filesTab, backups: backupsTab, settings: settingsTab })[tab](root, tab)].flat(Infinity).filter(x => x != null && x !== false));
    root.querySelector(".stats")?.replaceWith(stats());
  }).catch(e => {
    if (e.status === 401) return render(root, tab);
    body.replaceChildren(h("p", { class: "bad-box", text: e.message }));
  });
}

async function fetchAll(force) {
  if (!force && cache.rev === state.data.rev && cache.log) return;
  const [log, files, backups] = await Promise.all([admin("log"), admin("files"), admin("backups")]);
  Object.assign(cache, { rev: state.data.rev, log: log.entries, files, backups: backups.backups });
}
const go = t => (location.hash = "#/admin" + (t === "help" ? "" : "/" + t));

// ---------------------------------------------------------------- lock
function lockScreen(root) {
  renderBanner(h("div", { class: "grow" }, h("h1", { text: "Admin" }), h("p", { class: "sub", text: "For the person who looks after Snyder Hub." })));
  const box = h("div", { class: "panel lock" }, h("p", { class: "empty", text: "Checking…" }));
  root.replaceChildren(h("div", { class: "wrap page" }, box));
  admin("status", {}).then(st => {
    const pin = h("input", { id: "pin", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "12", placeholder: "PIN" });
    const pin2 = st.hasPin ? null : h("input", { id: "pin2", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "12", placeholder: "Type it again" });
    const remember = h("input", { type: "checkbox", id: "remember", checked: true });
    const err = h("p", { class: "err" });
    const submit = async e => {
      e.preventDefault(); err.textContent = "";
      if (pin2 && pin.value !== pin2.value) { err.textContent = "The two PINs don't match."; return; }
      try {
        const r = await admin(st.hasPin ? "login" : "setup", { pin: pin.value, remember: remember.checked });
        local.set("sa.adminToken", r.token); seenBefore = null; cache.rev = null;
        toast(st.hasPin ? "Signed in" : "PIN saved. Keep it to yourself."); render(root);
      } catch (er) { err.textContent = er.message; pin.select(); }
    };
    box.replaceChildren(h("form", { class: "stack", style: "gap:1rem", onsubmit: submit },
      h("h3", { text: st.hasPin ? "Enter your PIN" : "Choose an admin PIN" }),
      st.hasPin ? null : h("p", { class: "muted", text: "This is the first time Admin has been opened. Pick 4 to 12 numbers. Only people who know it can open this page." }),
      pin, pin2,
      h("label", { class: "check" }, remember, "Keep me signed in on this computer for 30 days"),
      err, h("button", { class: "btn primary", type: "submit" }, st.hasPin ? "Open Admin" : "Save PIN and open")));
    pin.focus();
  }).catch(e => box.replaceChildren(h("p", { class: "bad-box", text: e.message })));
}

// ---------------------------------------------------------------- top
function stats() {
  const help = state.data.help.filter(x => !x.done).length;
  const newWishes = state.data.wishes.filter(w => (w.createdAt || 0) > (seenBefore ?? 0)).length;
  const openWishes = state.data.wishes.filter(w => ["Open", "Planned", "In progress"].includes(w.status || "Open")).length;
  const week = cache.log ? cache.log.filter(e => e.t > Date.now() - 7 * 864e5 && !isVoteOnly(e)).length : null;
  const files = cache.files ? cache.files.files : null;
  const card = (n, label, sub, t, hot) => h("a", { class: "stat" + (hot ? " hot" : ""), href: "#/admin" + (t === "help" ? "" : "/" + t) }, h("b", { text: n == null ? "…" : String(n) }), h("span", { text: label }), h("small", { text: sub }));
  return h("div", { class: "stats" },
    card(help, help === 1 ? "person needs help" : "people need help", "installing a plugin", "help", help > 0),
    card(newWishes, "new wishlist " + (newWishes === 1 ? "request" : "requests"), openWishes + " open in total", "wishlist", newWishes > 0),
    card(week, "changes this week", "adds, edits and deletes", "activity"),
    card(files ? files.length : null, "uploaded files", files ? mb(files.reduce((a, f) => a + f.size, 0)) + " on the server" : "", "files"));
}
function tabsRow(tab) {
  const help = state.data.help.filter(x => !x.done).length;
  return h("div", { class: "subtabs", style: "margin-top:0" }, TABS.map(([k, l]) =>
    h("button", { type: "button", "aria-pressed": tab === k, onclick: () => go(k) }, l, k === "help" && help ? h("span", { class: "count", text: String(help) }) : null)));
}

// ---------------------------------------------------------------- help
function helpTab(root, tab) {
  const all = [...state.data.help].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const open = all.filter(x => !x.done), done = all.filter(x => x.done);
  const row = x => {
    const p = pluginById(x.plugin);
    return h("article", { class: "help-row" + (x.done ? " done" : "") },
      h("span", { class: "initials big", text: (x.name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() }),
      h("div", { class: "tx" },
        h("h4", null, x.name || "Someone", h("span", { class: "muted", text: " needs help installing " }), p ? h("a", { href: "#/plugin/" + encodeURIComponent(p.id), text: p.name }) : (x.plugin || "a plugin")),
        h("p", { class: "muted", text: [x.where ? "Sits at: " + x.where : "", "asked " + when(x.createdAt), x.done && x.doneAt ? "done " + when(x.doneAt) : ""].filter(Boolean).join(" · ") })),
      h("div", { class: "row" },
        x.done ? h("button", { class: "btn small", type: "button", onclick: () => upsert("help", { id: x.id, done: false }).then(() => toast("Moved back to waiting")) }, "Reopen")
          : h("button", { class: "btn primary small", type: "button", onclick: () => upsert("help", { id: x.id, done: true, doneAt: Date.now() }).then(() => toast("Marked done")) }, "✓ Done"),
        h("button", { class: "btn small", type: "button", onclick: () => confirmThen("Remove " + (x.name || "this") + "'s help request?", () => removeWithPosts("help", x.id, n => n.kind === "HELP" && n.plugin === x.plugin && n.by === x.name)) }, "Remove")));
  };
  return [
    h("p", { class: "lead", text: open.length ? "When someone clicks “Ask for help” on a plugin's Install window, it lands here. Mark it done once you've helped." : "Nobody is waiting for help right now. When someone clicks “Ask for help” on a plugin's Install window, it lands here." }),
    h("div", { class: "stack" }, open.map(row)),
    done.length ? h("button", { class: "link", type: "button", onclick: () => { showDoneHelp = !showDoneHelp; render(root, tab); } }, (showDoneHelp ? "Hide" : "Show") + " done (" + done.length + ")") : null,
    showDoneHelp ? h("div", { class: "stack" }, done.map(row)) : null];
}

// ---------------------------------------------------------------- wishlist
const STATUSES = ["Open", "Planned", "In progress", "Done"];
function wishTab() {
  const list = [...state.data.wishes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) return [h("p", { class: "empty", text: "No requests yet." })];
  return [h("p", { class: "lead", text: "Every request, newest first. Change the status here or remove ones that aren't needed." }),
    h("table", { class: "atable" },
      h("thead", null, h("tr", null, ["Request", "Software", "Asked by", "Votes", "Files", "Status", ""].map(t => h("th", { text: t })))),
      h("tbody", null, list.map(w => {
        const s = sw(w.software), isNew = (w.createdAt || 0) > (seenBefore ?? 0);
        return h("tr", null,
          h("td", null, h("b", null, w.title, isNew ? h("span", { class: "new", text: "New" }) : null), w.details ? h("small", { text: cut(w.details, 160) }) : null),
          h("td", null, h("span", { class: "badge " + s.cls, text: s.label || s.id })),
          h("td", null, w.requester || "—", h("small", { text: when(w.createdAt) })),
          h("td", { class: "num", text: String((w.voters || []).length) }),
          h("td", null, (w.files || []).length ? (w.files || []).map(f => h("a", { class: "fileline", href: f.kind === "upload" || f.kind === "link" ? f.path : null, target: "_blank", title: f.path, text: f.name || f.path.split(/[\\/]/).pop() })) : "—"),
          h("td", null, h("select", { "aria-label": "Status", onchange: e => upsert("wishes", { id: w.id, status: e.target.value }).then(() => toast("Marked " + e.target.value)) }, STATUSES.map(x => h("option", { selected: x === (w.status || "Open"), text: x })))),
          h("td", { class: "acts" }, h("button", { class: "link danger", type: "button", onclick: () => confirmThen("Remove the request “" + w.title + "”? Its What's New posts go too.", () => removeWithPosts("wishes", w.id, n => n.wish === w.id)) }, "Remove")));
      })))];
}

// ---------------------------------------------------------------- activity
const COLL = { links: "shortcut", plugins: "plugin", tools: "tool", wishes: "request", news: "post", help: "help request" };
const FILTERS = [["all", "Everything"], ["wishes", "Wishlist"], ["help", "Help"], ["plugins", "Plugins & tools"], ["links", "Shortcuts"], ["news", "Posts"], ["files", "Files"]];
const nameOf = r => r && (r.title || r.name || r.id);
// The name the person typed themselves (requests, help, posts). Plugins only have an author, not an editor.
const whoOf = (r, coll) => r && (coll === "help" ? r.name : coll === "wishes" ? r.requester : coll === "news" ? r.by : "");
function isVoteOnly(e) {
  return e.kind === "change" && e.changes.length === 1 && e.changes[0].coll === "wishes" && e.changes[0].before && e.changes[0].after &&
    changedKeys(e.changes[0].before, e.changes[0].after).every(k => k === "voters");
}
function changedKeys(a, b) { return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => k !== "updatedAt" && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])); }
function main(e) { return e.changes.find(c => c.coll !== "tools") || e.changes[0]; }
function describe(e) {
  if (e.kind === "upload") return { area: "files", text: "Uploaded the file “" + e.name + "” (" + mb(e.size) + ")" };
  if (e.kind === "delete-file") return { area: "files", text: "Deleted the file “" + e.name + "”" };
  if (e.kind === "restore") return { area: "all", text: "Restored everything from the backup " + e.name };
  const c = main(e), row = c.after || c.before, label = COLL[c.coll] || c.coll;
  const tools = e.changes.filter(x => x.coll === "tools" && x !== c).length;
  const extra = tools ? " and " + tools + " " + (tools === 1 ? "tool" : "tools") : "";
  let text;
  if (e.kind === "undo") text = "Undid a change to the " + label + " “" + nameOf(row) + "”";
  else if (isVoteOnly(e)) text = ((c.after.voters || []).length > (c.before.voters || []).length ? "Voted for" : "Took back a vote on") + " “" + nameOf(row) + "”";
  else if (c.coll === "help" && !c.before) text = (row.name || "Someone") + " asked for help installing " + (pluginById(row.plugin)?.name || "a plugin");
  else if (c.coll === "help" && c.before && c.after && changedKeys(c.before, c.after).includes("done")) text = (c.after.done ? "Marked done: " : "Reopened: ") + (row.name || "") + "'s help request";
  else if (c.coll === "wishes" && c.before && c.after && changedKeys(c.before, c.after).join() === "status") text = "Moved “" + nameOf(row) + "” to " + c.after.status;
  else text = (!c.before ? "Added the " : !c.after ? "Deleted the " : "Edited the ") + label + " “" + nameOf(row) + "”" + extra;
  return { area: c.coll === "tools" ? "plugins" : c.coll, text, who: !c.before && e.kind === "change" ? whoOf(row, c.coll) : "" };
}
function activityTab(root, tab) {
  const entries = (cache.log || []).filter(e => showVotes || !isVoteOnly(e)).map(e => ({ e, d: describe(e) }))
    .filter(({ e, d }) => actFilter === "all" || d.area === actFilter || (actFilter === "plugins" && e.changes?.some(c => c.coll === "tools")));
  const chips = h("div", { class: "filters" }, FILTERS.map(([k, l]) => h("button", { class: "chip", type: "button", "aria-pressed": actFilter === k, onclick: () => { actFilter = k; render(root, tab); } }, l)),
    h("label", { class: "check", style: "margin-left:auto" }, h("input", { type: "checkbox", checked: showVotes, onchange: e => { showVotes = e.target.checked; render(root, tab); } }), "Show votes"));
  if (!entries.length) return [chips, h("p", { class: "empty", text: cache.log?.length ? "Nothing here with this filter." : "No changes recorded yet. From now on, every add, edit and delete shows up here." })];
  const out = [chips]; let day = "";
  for (const { e, d } of entries) {
    const dl = dayLabel(e.t);
    if (dl !== day) { day = dl; out.push(h("h4", { class: "day-head", text: dl })); }
    const canUndo = (e.kind === "change") && !e.undone;
    const open = openDetail === e.id;
    out.push(h("div", { class: "act" + (e.undone ? " undone" : "") },
      h("span", { class: "time", text: new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }),
      h("span", { class: "dot a-" + d.area }),
      h("div", { class: "tx" },
        h("b", null, d.text, e.t > (seenBefore ?? 0) ? h("span", { class: "new", text: "New" }) : null, e.undone ? h("span", { class: "undone-tag", text: "Undone" }) : null),
        h("small", { text: [d.who ? "Name typed: " + d.who : "", "Computer: " + (e.pc || e.ip || "unknown") + (e.pc && e.ip && !e.pc.startsWith("this") ? " (" + e.ip + ")" : "")].filter(Boolean).join(" · ") }),
        open ? details(e) : null),
      h("div", { class: "acts" },
        e.changes || e.file ? h("button", { class: "link", type: "button", onclick: () => { openDetail = open ? null : e.id; render(root, tab); } }, open ? "Hide" : "Details") : null,
        canUndo ? h("button", { class: "link danger", type: "button", onclick: () => confirmThen("Undo this? It puts things back exactly how they were before: " + d.text + ".", async () => { await admin("undo", { id: e.id }); cache.rev = null; toast("Undone"); }) }, "Undo") : null)));
  }
  return out;
}
function details(e) {
  if (e.file) return h("div", { class: "diff" }, e.kind === "upload" ? h("a", { href: e.file, target: "_blank", text: "Open " + e.name }) : h("span", { text: e.file }));
  return h("div", { class: "diff" }, e.changes.slice(0, 40).map(c => {
    const head = (!c.before ? "Added " : !c.after ? "Deleted " : "Changed ") + (COLL[c.coll] || c.coll) + " “" + nameOf(c.after || c.before) + "”";
    const keys = c.before && c.after ? changedKeys(c.before, c.after) : ["title", "name", "details", "description", "url", "where", "status", "body", "files"].filter(k => (c.after || c.before)[k]);
    return h("div", { class: "dblock" }, h("b", { text: head }), keys.map(k => h("div", { class: "dline" }, h("span", { class: "k", text: k }),
      c.before && c.after ? [h("del", { text: show(c.before[k], k) }), h("span", { text: " → " }), h("ins", { text: show(c.after[k], k) })] : h("span", { text: show((c.after || c.before)[k], k) }))));
  }), e.changes.length > 40 ? h("small", { text: "…and " + (e.changes.length - 40) + " more" }) : null);
}
function show(v, k) {
  if (v === undefined || v === null || v === "") return "(empty)";
  if (k === "voters") return v.length + " votes";
  if (k === "files") return v.map(f => f.name || f.path).join(", ") || "(none)";
  return cut(typeof v === "string" ? v : JSON.stringify(v), 220);
}

// ---------------------------------------------------------------- files
function filesTab() {
  const { files, folder, disk } = cache.files;
  const total = files.reduce((a, f) => a + f.size, 0);
  return [
    h("div", { class: "panel soft", style: "gap:.4rem" },
      h("b", { text: "Where are these stored?" }),
      h("p", { text: "On the office server, in the uploads folder next to Snyder Hub — not on the internet, and not in GitHub. Nothing is sent anywhere else, so there's no cloud storage or monthly cost. The only limit is the free space on that drive." }),
      h("p", { class: "mono", style: "font-size:.85rem", text: folder }),
      h("p", { class: "muted", text: files.length + " files · " + mb(total) + " used · " + gb(disk.free) + " free on that drive" })),
    files.length ? h("table", { class: "atable" },
      h("thead", null, h("tr", null, ["", "File", "Size", "Uploaded", "Used by", ""].map(t => h("th", { text: t })))),
      h("tbody", null, [...files].sort((a, b) => b.t - a.t).map(f => h("tr", null,
        h("td", { class: "thumbcell" }, /\.(png|jpe?g|gif|webp)$/i.test(f.name) ? img(f.path, () => icon("folder")) : icon("folder")),
        h("td", null, h("a", { href: f.path, target: "_blank", text: f.name })),
        h("td", { class: "num", text: mb(f.size) }),
        h("td", { text: when(f.t) }),
        h("td", null, f.usedBy.length ? f.usedBy.map(u => h("small", { text: u.label + ": " + u.title })) : h("small", { class: "muted", text: "Not used anywhere" })),
        h("td", { class: "acts" }, h("button", { class: "link danger", type: "button", onclick: () => confirmThen("Delete " + f.name + " from the server?" + (f.usedBy.length ? " It's still attached to " + f.usedBy.map(u => u.title).join(", ") + ", so that link will stop working." : ""), async () => { await admin("delete-file", { name: f.name }); cache.rev = null; toast("File deleted"); window.dispatchEvent(new Event("sa:refresh")); }) }, "Delete"))))))
      : h("p", { class: "empty", text: "No files uploaded yet." })];
}

// ---------------------------------------------------------------- backups
function backupsTab() {
  const list = cache.backups;
  return [h("p", { class: "lead", text: "The server saves a copy of everything once a day, the first time something changes that day. Restoring replaces everything on Snyder Hub with that day's copy. Today's version is saved first, so you can come back." }),
    list.length ? h("table", { class: "atable" }, h("thead", null, h("tr", null, ["Copy", "Size", "", ""].map(t => h("th", { text: t })))),
      h("tbody", null, list.map(b => h("tr", null, h("td", { text: backupLabel(b.name) }), h("td", { class: "num", text: mb(b.size) }), h("td", { text: when(b.t) }),
        h("td", { class: "acts" }, h("button", { class: "btn small", type: "button", onclick: () => confirmThen("Replace everything on Snyder Hub with the copy from " + backupLabel(b.name) + "? Today's version is saved first.", async () => { await admin("restore", { name: b.name }); cache.rev = null; toast("Restored"); window.dispatchEvent(new Event("sa:refresh")); }) }, "Restore"))))))
      : h("p", { class: "empty", text: "No backups yet. The first one is made the next time something changes." })];
}

// ---------------------------------------------------------------- settings
function settingsTab(root) {
  const pin = h("input", { type: "password", inputmode: "numeric", maxlength: "12", placeholder: "New PIN (4–12 numbers)" });
  const err = h("p", { class: "err" });
  return [h("div", { class: "two-col" },
    h("div", { class: "panel", style: "gap:.8rem" }, h("h3", { text: "Change PIN" }), pin, err,
      h("button", { class: "btn primary", type: "button", onclick: async () => { try { const r = await admin("pin", { pin: pin.value, remember: true }); local.set("sa.adminToken", r.token); toast("PIN changed. Other computers are signed out."); pin.value = ""; } catch (e) { err.textContent = e.message; } } }, "Save new PIN"),
      h("small", { class: "muted", text: "Forgot it? On the server, delete admin.json in the sa-intranet folder. The next time you open Admin it asks you to choose a new PIN." })),
    h("div", { class: "panel", style: "gap:.8rem" }, h("h3", { text: "This computer" }),
      h("p", { text: "To get a pop-up when someone asks for help or posts a request, turn on alerts in What's New and tick Help requests and Wishlist." }),
      h("a", { class: "btn", href: "#/news" }, "Alert settings"),
      h("button", { class: "btn", type: "button", onclick: async () => { try { await admin("logout", {}); } catch (e) { /* ignore */ } local.set("sa.adminToken", ""); toast("Signed out"); location.hash = "#/"; } }, "Sign out of Admin")))];
}

// ---------------------------------------------------------------- helpers
async function removeWithPosts(coll, id, postMatch) {
  const posts = state.data.news.filter(postMatch);
  await batch([{ op: "delete", coll, id }, ...posts.map(n => ({ op: "delete", coll: "news", id: n.id }))]);
  cache.rev = null; toast("Removed");
}
async function confirmThen(msg, fn) { if (!confirm(msg)) return; try { await fn(); } catch (e) { toast(e.message); } }
const cut = (s, n) => (s = String(s)).length > n ? s.slice(0, n - 1) + "…" : s;
const mb = b => b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1) + " MB";
const gb = b => (b / 1024 ** 3).toFixed(b > 100 * 1024 ** 3 ? 0 : 1) + " GB";
function dayLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}
function backupLabel(n) {
  const m = n.match(/(\d{4}-\d{2}-\d{2})(?:-(\d{2})(\d{2}))?/);
  if (!m) return n;
  const d = new Date(m[1] + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "long", day: "numeric", year: "numeric" });
  return (n.startsWith("before-restore") ? "Before a restore, " : "") + d + (m[2] ? " " + m[2] + ":" + m[3] : "");
}
