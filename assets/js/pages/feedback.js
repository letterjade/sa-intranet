// Shared per-tool discussions. Draft names are never remembered or prefilled.
import { state, send, canEdit, onChange } from "../api.js";
import { h, field, openModal, modalHead, toast, when } from "../ui.js";

export const feedbackCount = tool => state.data.feedback.filter(r => r.tool === tool).length;

export function feedbackWindow(tool) {
  const list = h("div", { class: "stack feedback-list", "aria-live": "polite" });
  const form = parent => {
    const suffix = parent || "new";
    const name = h("input", { id: "feedback-name-" + suffix, value: "", maxlength: 60, autocomplete: "off", required: true });
    const body = h("textarea", { id: "feedback-body-" + suffix, rows: 3, maxlength: 4000, required: true, placeholder: parent ? "Write a reply…" : "Report a bug, suggest an improvement, or share feedback…" });
    const error = h("p", { class: "err", role: "alert" });
    const button = h("button", { class: "btn primary", type: "submit", disabled: !canEdit() }, parent ? "Post reply" : "Post comment");
    return h("form", { class: "stack feedback-form", autocomplete: "off", onsubmit: async e => {
      e.preventDefault();
      if (!name.value.trim() || !body.value.trim()) { error.textContent = "Enter your name and a comment."; return; }
      button.disabled = true; error.textContent = "";
      try {
        await send({ op: "feedback-post", tool: tool.id, parent: parent || null, author: name.value.trim(), body: body.value.trim() });
        name.value = ""; body.value = ""; refresh(); toast(parent ? "Reply posted" : "Feedback posted");
      } catch (e) { error.textContent = e.message; }
      finally { button.disabled = !canEdit(); }
    } }, field("Your name", name), field(parent ? "Reply" : "Comment", body), error, button);
  };
  const comment = row => h("div", { class: "feedback-comment" },
    h("div", { class: "meta" }, h("b", { text: row.author }), " · ", h("time", { datetime: new Date(row.createdAt).toISOString(), title: new Date(row.createdAt).toLocaleString(), text: when(row.createdAt) })),
    h("p", { class: "feedback-text", text: row.body }));
  const refresh = () => {
    // Keep reply forms (including drafts) when another colleague posts.
    const drafts = new Map([...list.querySelectorAll("[data-reply]")].map(el => [el.dataset.reply, el]));
    const rows = state.data.feedback.filter(r => r.tool === tool.id);
    const threads = rows.filter(r => !r.parent).sort((a, b) => b.createdAt - a.createdAt);
    list.replaceChildren(...(threads.length ? threads.map(row => {
      const status = h("select", { "aria-label": "Discussion status", disabled: !canEdit(), onchange: async () => {
        status.disabled = true;
        try { await send({ op: "feedback-status", id: row.id, status: status.value }); refresh(); }
        catch (e) { status.value = row.status || "Open"; toast(e.message); }
        finally { status.disabled = !canEdit(); }
      } }, ["Open", "In progress", "Resolved"].map(s => h("option", { value: s, selected: s === (row.status || "Open"), text: s })));
      const reply = drafts.get(row.id) || h("details", { "data-reply": row.id }, h("summary", { text: "Reply" }), form(row.id));
      return h("article", { class: "panel feedback-thread" }, comment(row), field("Status", status),
        h("div", { class: "feedback-replies" }, rows.filter(r => r.parent === row.id).sort((a, b) => a.createdAt - b.createdAt).map(comment)), reply);
    }) : [h("p", { class: "empty", text: "No feedback yet. Start the discussion." })]));
  };
  refresh();
  const dialog = openModal([modalHead("Comments & discussion · " + tool.name, "Share feedback and reply to coworkers. Anyone in the office can update a discussion's status."),
    canEdit() ? form(null) : h("p", { class: "note", text: "Start the SA Intranet server to post feedback." }), list]);
  active = { dialog, refresh };
  dialog.addEventListener("close", () => {
    if (active?.refresh === refresh) active = null;
    window.dispatchEvent(new Event("sa:refresh"));
  }, { once: true });
}
let active = null;
onChange(() => { if (active?.dialog.open) active.refresh(); });
