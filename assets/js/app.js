// ---------------------------------------------------------------------------
// SA Intranet — starts everything and picks the page from the address.
//   #/                     Home
//   #/plugins[/revit]      Office Plugins (optionally one software)
//   #/plugin/<id>          One plugin
//   #/plugin/<id>/edit     Edit a plugin
//   #/plugins/new[/Revit]  Add a plugin
//   #/systems              Office Systems
//   #/wishlist             Wishlist
//   #/news                 What's New + alert settings
//   #/search/<words>       Search
// ---------------------------------------------------------------------------
import { load, onChange, state } from "./api.js";
import { h, renderBanner } from "./ui.js";
import { checkForNew } from "./notify.js";
import * as home from "./pages/home.js";
import * as plugins from "./pages/plugins.js";
import * as plugin from "./pages/plugin.js";
import * as editor from "./pages/editor.js";
import * as systems from "./pages/systems.js";
import * as wishlist from "./pages/wishlist.js";
import * as news from "./pages/news.js";
import * as search from "./pages/search.js";

const root = document.getElementById("page");

function route() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (a === "plugins" && b === "new") return editor.render(root, null, c);
  if (a === "plugins") return plugins.render(root, b);
  if (a === "plugin" && c === "edit") return editor.render(root, b);
  if (a === "plugin") return plugin.render(root, b);
  if (a === "systems") return systems.render(root);
  if (a === "wishlist") return wishlist.render(root);
  if (a === "news") return news.render(root);
  if (a === "search") return search.render(root, parts.slice(1).join("/"));
  return home.render(root);
}

function draw({ keepScroll = false, animate = false } = {}) {
  const y = window.scrollY;
  const focusId = document.activeElement && document.activeElement.id;
  route();
  if (state.mode === "offline") document.getElementById("page").prepend(h("div", { class: "wrap page" }, h("p", { class: "bad-box", text: "Couldn't load SA Intranet's data. Open it through the server address (http://…), not by double-clicking the file." })));
  else if (state.mode === "readonly") document.getElementById("page").prepend(h("div", { class: "wrap", style: "padding-top:1rem" }, h("p", { class: "note", text: "Read-only: the SA Intranet server isn't running, so changes can't be saved." })));
  if (animate) playEnter();
  if (keepScroll) window.scrollTo(0, y);
  if (focusId) document.getElementById(focusId)?.focus();
}

// Gentle arrival animation when you open a page (not when data refreshes).
let enterTimer;
function playEnter() {
  const items = document.querySelectorAll("#page .section-head, #page .subtabs, #page .cards > *, #page .tiles > *, #page .tools > *, #page .stack > .req, #page .stack > .post, #page .cols > aside > *, #page .card-section, #page .rule-head");
  items.forEach((el, i) => { el.dataset.stagger = ""; el.style.setProperty("--i", Math.min(i, 14)); });
  document.body.classList.remove("enter"); void document.body.offsetWidth; document.body.classList.add("enter");
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => { document.body.classList.remove("enter"); items.forEach(el => delete el.dataset.stagger); }, 1600);
}

window.addEventListener("hashchange", () => { draw({ animate: true }); window.scrollTo(0, 0); });
window.addEventListener("sa:refresh", () => draw({ keepScroll: true }));
document.addEventListener("keydown", e => {
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.getElementById("modal").open) { const q = document.getElementById("q"); if (q) { e.preventDefault(); q.focus(); } }
});
// Re-draw when data changes, but never while someone is typing in a form.
onChange(({ fromPoll } = {}) => {
  checkForNew();
  const busy = document.getElementById("modal").open || (fromPoll && /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || ""));
  if (!busy) draw({ keepScroll: true });
});

renderBanner();
load().then(() => { draw({ animate: true }); checkForNew(); });
