// Wishlist: requests for new tools, with votes, status and attached files.
import { h, renderTopbar, renderBanner, SOFTWARE, sw, fileRef, toast, field, when } from "../ui.js";
import { state, canEdit, upsert, remove, send, newId, voterId, upload } from "../api.js";
import { postNews } from "./common.js";

const STATUSES = ["Open", "Planned", "In progress", "Done"];
let tab = "open", softFilter = "", draft = null, editing = null;

export function render(root) {
  renderTopbar("Wishlist");
  renderBanner(h("div", { class: "grow" }, h("h1", { text: "Wishlist" }), h("p", { class: "sub", text: "Ask for a tool that doesn't exist yet. Vote for the ones you'd use too." })));
  const all = state.data.wishes;
  const inTab = w => tab === "all" || (tab === "open" ? ["Open", "Planned"].includes(w.status || "Open") : tab === "progress" ? w.status === "In progress" : w.status === "Done");
  const list = all.filter(w => inTab(w) && (!softFilter || w.software === softFilter)).sort((a, b) => (b.voters || []).length - (a.voters || []).length || (b.createdAt || 0) - (a.createdAt || 0));
  const n = f => all.filter(f).length;
  const tabs = h("div", { class: "subtabs" }, [["open", "Open & planned", w => ["Open", "Planned"].includes(w.status || "Open")], ["progress", "In progress", w => w.status === "In progress"], ["done", "Done", w => w.status === "Done"], ["all", "All", () => true]].map(([k, l, f]) =>
    h("button", { type: "button", "aria-pressed": tab === k, onclick: () => { tab = k; render(root); } }, l + "  " + n(f))));
  const filters = h("div", { class: "filters" }, h("span", { class: "muted", text: "Software:" }), [["", "All"], ...SOFTWARE.map(s => [s.id, s.label || s.id])].map(([v, l]) =>
    h("button", { class: "chip", type: "button", "aria-pressed": softFilter === v, onclick: () => { softFilter = v; render(root); } }, l)));
  const cards = list.length ? list.map(w => requestCard(w, root)) : [h("p", { class: "empty", text: "Nothing here yet. Be the first to ask for a tool." })];
  root.replaceChildren(h("div", { class: "wrap page", style: "padding-top:0" }, tabs,
    h("div", { class: "cols", style: "margin-top:1.8rem" }, h("div", { class: "stack" }, filters, ...cards), requestForm(root))));
}

function requestCard(w, root) {
  const mine = (w.voters || []).includes(voterId), votes = (w.voters || []).length, s = sw(w.software);
  const status = w.status || "Open";
  const statusSel = h("select", { "aria-label": "Status", disabled: !canEdit(), onchange: async e => {
    try { await upsert("wishes", { id: w.id, status: e.target.value });
      if (["Planned", "In progress", "Done"].includes(e.target.value)) await postNews({ kind: "WISHLIST", wish: w.id, title: "“" + w.title + "” is now " + e.target.value.toLowerCase(), by: "Wishlist" });
      toast("Marked " + e.target.value); } catch (er) { toast(er.message); } } }, STATUSES.map(x => h("option", { selected: x === status, text: x })));
  return h("article", { class: "req" },
    h("button", { class: "vote", type: "button", "aria-pressed": mine, disabled: !canEdit(), title: mine ? "Remove my vote" : "I'd use this too", "aria-label": (mine ? "Remove vote. " : "Vote. ") + votes + " votes",
      onclick: async () => { try { await send({ op: "vote", wish: w.id, voter: voterId, on: !mine }); } catch (e) { toast(e.message); } } },
      h("span", { text: "▲" }), h("b", { text: String(votes) }), h("small", { text: votes === 1 ? "vote" : "votes" })),
    h("div", { class: "tx" },
      h("div", { class: "top" }, h("span", { class: "badge " + s.cls, text: s.label || s.id }), h("span", { class: "status st-" + status.replace(/\s/g, "-"), text: status }), h("span", { text: [w.requester, when(w.createdAt)].filter(Boolean).join(" · ") })),
      h("h4", { text: w.title }), w.details ? h("p", { text: w.details }) : null,
      (w.files || []).length ? h("div", { class: "stack", style: "gap:.4rem" }, w.files.map(f => fileRef(f))) : null),
    canEdit() ? h("div", { class: "side" }, h("button", { class: "link", type: "button", onclick: () => { editing = w; draft = { ...w, files: [...(w.files || [])] }; render(root); document.getElementById("wTitle")?.focus(); } }, "Edit"), statusSel) : null);
}

function requestForm(root) {
  if (!draft) draft = { title: "", software: "Revit", details: "", requester: localStorage.getItem("sa.name") || "", files: [] };
  const title = h("input", { id: "wTitle", maxlength: "120", placeholder: "e.g. Batch renumber sheets by discipline", oninput: e => (draft.title = e.target.value) }); title.value = draft.title;
  const details = h("textarea", { id: "wDetails", maxlength: "2000", placeholder: "What are you doing by hand today? How often?", oninput: e => (draft.details = e.target.value) }); details.value = draft.details;
  const name = h("input", { id: "wName", maxlength: "60", placeholder: "So the builder can follow up", oninput: e => (draft.requester = e.target.value) }); name.value = draft.requester;
  const path = h("input", { id: "wPath", maxlength: "400", placeholder: "\\\\192.168.100.3\\Projects\\…\\spec.docx", style: "font-family:var(--mono)" });
  const filesBox = h("div", { class: "stack", style: "gap:.4rem" });
  const paintFiles = () => filesBox.replaceChildren(...draft.files.map((f, i) => fileRef(f, h("button", { class: "btn small", type: "button", "aria-label": "Remove file", onclick: () => { draft.files.splice(i, 1); paintFiles(); } }, "✕"))));
  paintFiles();
  const addPath = () => { const v = path.value.trim().replace(/^"|"$/g, ""); if (!v) return; draft.files.push({ kind: /^https?:\/\//i.test(v) ? "link" : "path", path: v }); path.value = ""; paintFiles(); };
  path.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPath(); } });
  const fileIn = h("input", { type: "file", hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; try { const r = await upload(f); draft.files.push({ kind: "upload", path: r.path, name: r.name }); paintFiles(); } catch (er) { toast(er.message); } } });
  const choices = h("div", { class: "choices", style: "grid-template-columns:1fr 1fr" }, SOFTWARE.map(s => h("button", { type: "button", class: "choice " + s.cls, "aria-pressed": draft.software === s.id, onclick: () => { draft.software = s.id; render(root); } },
    h("span", { class: "swmark", text: s.id[0] }), h("b", { text: s.label || s.id }))));
  const err = h("p", { class: "err" });
  const submit = async () => {
    if (!draft.title.trim()) { err.textContent = "Say what you need the tool to do."; return; }
    try { localStorage.setItem("sa.name", draft.requester.trim()); } catch (e) { /* ignore */ }
    const item = { id: editing ? editing.id : newId("w"), title: draft.title.trim(), software: draft.software, details: draft.details.trim(), requester: draft.requester.trim(), files: draft.files };
    if (!editing) { item.status = "Open"; item.voters = [voterId]; }
    try {
      await upsert("wishes", item);
      if (!editing) await postNews({ kind: "WISHLIST", wish: item.id, title: "New request: " + item.title, body: item.details, by: item.requester });
      toast(editing ? "Request updated" : "Request posted. It's on the Wishlist and in What's New.");
      draft = null; editing = null; render(root);
    } catch (e) { err.textContent = e.message; }
  };
  return h("aside", { class: "panel", style: "gap:1.1rem;padding:1.6rem;position:sticky;top:5.5rem" },
    h("h3", { text: editing ? "Edit request" : "Request a tool" }),
    field("What do you need it to do?", title),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Which software?" }), choices),
    field("Details", details),
    h("div", { class: "field" }, h("label", { for: "wPath", text: "Attach a file from the server" }), h("div", { class: "row", style: "flex-wrap:nowrap" }, path, h("button", { class: "btn", type: "button", onclick: addPath }, "Add")),
      h("span", { class: "hint", text: "Shift + right-click the file › Copy as path. Everyone opens it from the same path." }),
      h("div", { class: "row", style: "align-items:center" }, h("button", { class: "btn small", type: "button", onclick: () => fileIn.click() }, "Or upload a file"), h("span", { class: "hint", text: "Word, Excel, PDF, DWG, RVT · up to 50 MB" }), fileIn), filesBox),
    field("Your name", name), err,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", style: "flex:1", disabled: !canEdit(), onclick: submit }, editing ? "Save changes" : "Post request"),
      editing ? h("button", { class: "btn", type: "button", onclick: () => { draft = null; editing = null; render(root); } }, "Cancel") : null,
      editing ? h("button", { class: "btn", type: "button", onclick: async () => { await remove("wishes", editing.id); draft = null; editing = null; toast("Request removed"); render(root); } }, "Remove") : null));
}
