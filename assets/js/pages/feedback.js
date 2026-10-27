// Plugin discussions. Only opaque post-editing keys are stored in this browser.
import { state, send, canEdit } from "../api.js";
import { h, field, toast, when } from "../ui.js";

const drafts = new Map(), editing = new Set(), expanded = new Set(), pending = new Set(), filters = new Map();
const ownershipKey = "sa.discussionPostKeys";
const rowsFor = plugin => (state.data.feedback || []).filter(row =>
  (row.plugin || state.data.tools.find(t => t.id === row.tool)?.plugin) === plugin);
export const discussionCount = plugin => rowsFor(plugin).filter(r => !r.parent).length;
const ready = () => canEdit() && (state.data.capabilities || []).includes("plugin-discussions-v2");
const redraw = () => window.dispatchEvent(new Event("sa:refresh"));
function keys() { try { return JSON.parse(localStorage.getItem(ownershipKey) || "{}"); } catch (e) { return {}; } }
function randomHex(bytes) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join(""); }
function remember(id, token) {
  const own = keys(); own[id] = token;
  localStorage.setItem(ownershipKey, JSON.stringify(own));
  if (keys()[id] !== token) throw new Error("Allow browser storage to post and manage your comments.");
}
function draftFor(key, initial = {}) { if (!drafts.has(key)) drafts.set(key, { name: "", body: "", tool: "", ...initial }); return drafts.get(key); }

export function discussionPanel(plugin, tools) {
  const box = h("section", { class: "stack discussion-board", "aria-label": "Plugin discussion" });
  const rows = rowsFor(plugin.id), filter = filters.get(plugin.id) || "all";
  const topic = id => id ? tools.find(t => t.id === id)?.name || "Former tool" : "General plugin discussion";
  const options = selected => [h("option", { value: "", selected: !selected, text: "General plugin discussion" }),
    ...tools.map(t => h("option", { value: t.id, selected: selected === t.id, text: t.name }))];

  function composer(parent = null) {
    const key = plugin.id + ":" + (parent || "new"), draft = draftFor(key);
    const name = h("input", { id: "discussion-name-" + (parent || plugin.id), value: draft.name, maxlength: 60, required: true, autocomplete: "off", placeholder: "Your name", oninput: e => draft.name = e.target.value });
    const body = h("textarea", { id: "discussion-body-" + (parent || plugin.id), rows: 3, maxlength: 4000, required: true, autocomplete: "off", placeholder: parent ? "Write a reply…" : "Ask a question, report an issue, or suggest an improvement…", oninput: e => draft.body = e.target.value });
    body.value = draft.body;
    const choice = h("select", { id: "discussion-tool-" + plugin.id, onchange: e => draft.tool = e.target.value }, options(draft.tool));
    const error = h("p", { class: "err", role: "alert" });
    const submit = h("button", { class: "btn primary", type: "submit", disabled: !ready() || pending.has(key) }, parent ? "Post reply" : "Start discussion");
    return h("form", { class: "panel discussion-composer stack" + (parent ? "" : " discussion-new-form"), autocomplete: "off", onsubmit: async e => {
      e.preventDefault(); if (pending.has(key)) return;
      if (!ready()) { error.textContent = "Update and restart the intranet server before posting."; return; }
      if (!draft.name.trim() || !draft.body.trim()) { error.textContent = "Enter your name and a comment."; return; }
      pending.add(key); submit.disabled = true; error.textContent = "";
      try {
        const id = randomHex(16), token = randomHex(32);
        remember(id, token);
        await send({ op: "feedback-post", id, plugin: plugin.id, tool: parent ? null : draft.tool || null, parent, author: draft.name.trim(), body: draft.body.trim(), edit_token: token });
        drafts.delete(key); if (parent) expanded.delete(parent); else filters.set(plugin.id, "all");
        toast(parent ? "Reply posted" : "Discussion posted");
      } catch (e) { error.textContent = e.message; }
      finally { pending.delete(key); submit.disabled = !ready(); }
      if (!drafts.has(key)) redraw();
    } }, parent ? null : h("h3", { text: "Start a discussion" }),
      parent ? null : field("Which tool is this about?", choice), field("Your name", name), field(parent ? "Reply" : "Comment", body), error, submit);
  }

  function editForm(row) {
    const key = "edit:" + row.id, draft = draftFor(key, { body: row.body });
    const body = h("textarea", { id: "discussion-edit-" + row.id, rows: 4, maxlength: 4000, required: true, oninput: e => draft.body = e.target.value }); body.value = draft.body;
    const error = h("p", { class: "err", role: "alert" });
    const save = h("button", { class: "btn primary small", type: "submit", disabled: !ready() || pending.has(key) }, "Save changes");
    return h("form", { class: "stack feedback-form", onsubmit: async e => {
      e.preventDefault(); if (pending.has(key)) return;
      if (!draft.body.trim()) { error.textContent = "Enter a comment."; return; }
      pending.add(key); save.disabled = true;
      try { await send({ op: "feedback-edit", id: row.id, body: draft.body.trim(), edit_token: keys()[row.id] }); editing.delete(row.id); drafts.delete(key); toast("Comment updated"); }
      catch (e) { error.textContent = e.message; }
      finally { pending.delete(key); save.disabled = !ready(); }
      if (!editing.has(row.id)) redraw();
    } }, field("Edit your comment", body), error, h("div", { class: "actions" }, save,
      h("button", { class: "btn small", type: "button", onclick: () => { editing.delete(row.id); drafts.delete(key); redraw(); } }, "Cancel")));
  }

  function comment(row) {
    const mine = !!keys()[row.id];
    const actions = mine && !row.deleted ? h("div", { class: "discussion-actions" },
      h("button", { class: "link", type: "button", disabled: !ready(), onclick: () => { editing.add(row.id); redraw(); } }, "Edit"),
      h("button", { class: "link danger", type: "button", disabled: !ready() || pending.has("delete:" + row.id), onclick: async e => {
        const button = e.currentTarget;
        if (!button.dataset.confirmDelete) { button.dataset.confirmDelete = "yes"; button.textContent = "Confirm delete"; return; }
        const key = "delete:" + row.id; if (pending.has(key)) return;
        pending.add(key); button.disabled = true;
        try { await send({ op: "feedback-delete", id: row.id, edit_token: keys()[row.id] }); editing.delete(row.id); drafts.delete("edit:" + row.id); toast("Comment deleted"); }
        catch (e) { toast(e.message); }
        finally { pending.delete(key); button.disabled = !ready(); redraw(); }
      } }, "Delete")) : null;
    return h("div", { class: "feedback-comment" },
      h("div", { class: "discussion-meta" }, h("b", { text: row.deleted ? "Deleted post" : row.author }),
        h("time", { datetime: new Date(row.createdAt).toISOString(), title: new Date(row.createdAt).toLocaleString(), text: when(row.createdAt) }),
        !row.deleted && row.updatedAt ? h("small", { text: "Edited" }) : null),
      row.deleted ? h("p", { class: "muted", text: "This comment was deleted by its author. Replies are kept." })
        : editing.has(row.id) && mine ? editForm(row) : h("p", { class: "feedback-text", text: row.body }), actions);
  }

  const filterInput = h("select", { id: "discussion-filter-" + plugin.id, onchange: e => { filters.set(plugin.id, e.target.value); redraw(); } },
    h("option", { value: "all", selected: filter === "all", text: "All tools" }),
    h("option", { value: "general", selected: filter === "general", text: "General plugin discussion" }),
    tools.map(t => h("option", { value: t.id, selected: filter === t.id, text: t.name })));
  const header = h("div", { class: "section-head discussion-list-header" },
    h("div", { class: "t" }, h("h2", { text: "Discussion" })),
    field("Show discussions for", filterInput));
  if (!ready()) box.append(h("p", { class: "bad-box", role: "status", text: canEdit()
    ? "The website has updated, but its Python server is still running an older version. On the server computer, run Update-from-GitHub.bat, close the server window, reopen Start-SA-Intranet.bat, then refresh this page. Posting is disabled until the server is ready."
    : "Open this page through the running SA Intranet server to post comments." }));
  const threads = rows.filter(r => !r.parent && (filter === "all" || (filter === "general" ? !r.tool : r.tool === filter))).sort((a,b) => b.createdAt - a.createdAt);
  const list = h("div", { class: "stack discussion-threads" });
  for (const row of threads) {
    const status = h("select", { "aria-label": "Discussion status", disabled: !ready() || !keys()[row.id] || row.deleted, onchange: async () => {
      status.disabled = true;
      try { await send({ op: "feedback-status", id: row.id, status: status.value, edit_token: keys()[row.id] }); }
      catch (e) { status.value = row.status || "Open"; toast(e.message); }
      finally { status.disabled = !ready() || !keys()[row.id] || row.deleted; }
    } }, ["Open", "In progress", "Resolved"].map(s => h("option", { value: s, selected: s === (row.status || "Open"), text: s })));
    const replies = rows.filter(r => r.parent === row.id).sort((a,b) => a.createdAt - b.createdAt);
    list.append(h("article", { class: "panel feedback-thread", "aria-label": "Discussion about " + topic(row.tool) },
      h("div", { class: "discussion-thread-head" }, h("span", { class: "pill", text: topic(row.tool) }), status), comment(row),
      h("div", { class: "feedback-replies" }, replies.map(comment)),
      h("details", { open: expanded.has(row.id), ontoggle: e => { if (e.target.open) expanded.add(row.id); else expanded.delete(row.id); } }, h("summary", { text: "Reply to this discussion" }), composer(row.id))));
  }
  if (!threads.length) list.append(h("p", { class: "empty", text: filter === "all" ? "No discussions yet. Use the form to start one." : "No discussions for this tool yet." }));
  box.append(h("div", { class: "discussion-layout" },
    h("div", { class: "stack discussion-main" }, header, list),
    h("aside", { class: "discussion-sidebar", "aria-label": "Start a discussion" }, composer(),
      h("p", { class: "discussion-ownership-hint", text: "Edit or delete your posts from this browser. Names are not remembered; clearing browser data removes editing access." }))));
  return box;
}
