// What's New: tool updates, wishlist progress, help requests and office news,
// plus the alert settings for this computer.
import { h, renderTopbar, renderBanner, openModal, closeModal, modalHead, field, toast, when } from "../ui.js";
import { state, canEdit, remove } from "../api.js";
import { newsItems, newsThumb, newsLink, postNews } from "./common.js";
import { settingsPanel } from "../notify.js";

let filter = "all";
const FILTERS = [["all", "Everything", () => true], ["tools", "Tool updates", n => ["NEW TOOL", "NEW PLUGIN", "UPDATE"].includes(n.kind)], ["news", "Office news", n => n.kind === "OFFICE NEWS"], ["wishlist", "Wishlist", n => n.kind === "WISHLIST"], ["help", "Help requests", n => n.kind === "HELP"]];

export function render(root) {
  renderTopbar("What's New");
  renderBanner(h("div", { class: "grow" }, h("h1", { text: "What's new" }), h("p", { class: "sub", text: "New tools, plugin updates, wishlist progress and office news, newest first." })),
    canEdit() ? h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: postWindow }, "+ Post office news")) : null);
  const f = FILTERS.find(x => x[0] === filter);
  const items = newsItems().filter(f[2]);
  const tabs = h("div", { class: "subtabs" }, FILTERS.map(([k, l]) => h("button", { type: "button", "aria-pressed": filter === k, onclick: () => { filter = k; render(root); } }, l)));
  const feed = h("div", { class: "stack" });
  let lastDay = "";
  for (const n of items) {
    const d = dayLabel(n.createdAt); if (d !== lastDay) { feed.append(h("div", { class: "day", text: d })); lastDay = d; }
    feed.append(h("article", { class: "post" }, newsThumb(n),
      h("div", { class: "tx" }, h("span", { class: "kind k-" + n.kind.replace(/\s/g, "-"), text: n.kind }), h("h4", { text: n.title }), n.body ? h("p", { text: n.body }) : null,
        h("span", { class: "meta", text: [n.by, when(n.createdAt)].filter(Boolean).join(" · ") }),
        h("div", { class: "row", style: "gap:1rem" }, n.plugin || n.wish ? h("a", { class: "link", href: newsLink(n) }, n.plugin ? "Open the plugin  →" : "See the request  →") : null,
          canEdit() ? h("button", { class: "link", type: "button", style: "color:var(--gray)", onclick: async () => { await remove("news", n.id); toast("Post removed"); } }, "Remove") : null))));
  }
  if (!items.length) feed.append(h("p", { class: "empty", text: "Nothing here yet." }));
  root.replaceChildren(h("div", { class: "wrap page", style: "padding-top:0" }, tabs,
    h("div", { class: "cols", style: "margin-top:1.8rem" }, feed, h("aside", { class: "stack" }, settingsPanel(() => render(root))))));
}

function dayLabel(ts) {
  const d = new Date(ts || 0), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = (t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5;
  return diff <= 0 ? "Today" : diff < 7 ? "This week" : diff < 31 ? "This month" : "Earlier";
}

function postWindow() {
  const title = h("input", { id: "nTitle", maxlength: "120", placeholder: "e.g. Revit 2026 roll-out starts Monday" });
  const body = h("textarea", { id: "nBody", maxlength: "1500", placeholder: "A few sentences" });
  const by = h("input", { id: "nBy", maxlength: "60", value: "", placeholder: "Your name or team" });
  const err = h("p", { class: "err" });
  openModal([modalHead("Post office news"), field("Headline", title), field("Details", body), field("Posted by", by), err,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", style: "flex:1", onclick: async () => {
      if (!title.value.trim()) { err.textContent = "Add a headline."; return; }
      try { await postNews({ kind: "OFFICE NEWS", title: title.value.trim(), body: body.value.trim(), by: by.value.trim() }); closeModal(); toast("Posted"); } catch (e) { err.textContent = e.message; } } }, "Post"),
      h("button", { class: "btn", type: "button", onclick: closeModal }, "Cancel"))], { narrow: true });
  title.focus();
}
