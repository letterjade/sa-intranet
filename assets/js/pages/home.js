// Home: two jobs — open an office plugin, or open an office system.
import { h, icon, renderTopbar, renderBanner, searchBox, SOFTWARE } from "../ui.js";
import { state, activeWishes } from "../api.js";
import { appTile, addShortcutTile, allLinks, newsItems, feedRow } from "./common.js";
import { alertsLine } from "../notify.js";

let tab = "Updates";

export function render(root) {
  renderTopbar("Home");
  const hr = new Date().getHours();
  renderBanner(
    h("div", { class: "grow" },
      h("h1", { text: hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening" }),
      h("p", { class: "sub", text: new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) })),
    searchBox());

  const hints = { Revit: "AI, annotations and detail tools", AutoCAD: "Room areas and drafting tools", Adobe: "Photoshop and Illustrator assets", Rhino: "Grasshopper patterns and scripts", Other: "More office tools" };
  const categories = SOFTWARE.map(s => {
    const n = state.data.plugins.filter(p => (p.software || "Other") === s.id).length;
    return h("a", { class: "software-shortcut", href: "#/plugins/" + s.id.toLowerCase() },
      h("span", { class: "shortcut-letter", "aria-hidden": "true", text: s.id === "AutoCAD" ? "CAD" : s.id === "Adobe" ? "Ps / Ai" : s.id === "Rhino" ? "GH" : s.id === "Revit" ? "R" : "…" }),
      h("span", { class: "shortcut-copy" }, h("b", { text: s.label || s.id }), h("small", { text: hints[s.id] }), h("span", { class: "shortcut-count", text: n ? n + (n === 1 ? " plugin" : " plugins") : "Browse category" })),
      h("span", { class: "shortcut-arrow", "aria-hidden": "true", text: "→" }));
  });
  const main = h("div", { class: "stack" },
    h("div", { class: "section-head" },
      h("div", { class: "t" }, h("h2", { text: "Office plugins" }), h("p", { text: "Choose your software to find tools, templates and installation help." })),
      h("a", { class: "btn", href: "#/plugins" }, "All office plugins  →")),
    h("nav", { class: "software-shortcuts", "aria-label": "Browse office plugins by software" }, categories),
    h("div", { class: "spacer" }),
    h("div", { class: "section-head" },
      h("div", { class: "t" }, h("h2", { text: "Office systems" }), h("p", { text: "Your everyday office links, all in one place." }))),
    h("div", { class: "tiles" }, allLinks().map(l => appTile(l)), addShortcutTile()));

  const side = h("aside", { class: "stack", style: "gap:1.27rem" }, whatsNew(),
    h("div", { class: "panel tint" },
      h("h3", { text: "Need a tool that doesn't exist?" }),
      h("p", { style: "color:var(--body);font-size:.95rem", text: "Tell us what you do by hand. The people who build tools will see it." }),
      h("a", { class: "btn primary block", href: "#/wishlist" }, "Request a tool")),
    alertsLine());

  root.replaceChildren(h("div", { class: "wrap page" }, h("div", { class: "cols" }, main, side)));
}

function whatsNew() {
  const box = h("div", { class: "panel" });
  const paint = () => {
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Show" }, ["Updates", "Requests", "News"].map(n =>
      h("button", { type: "button", "aria-pressed": tab === n, onclick: () => { tab = n; paint(); } }, n)));
    let rows;
    if (tab === "Requests") {
      const ws = activeWishes().sort((a, b) => (b.voters || []).length - (a.voters || []).length).slice(0, 4);
      rows = ws.length ? ws.map(w => h("a", { class: "feed-row", href: "#/wishlist" },
        h("span", { class: "thumb", style: "font-size:1rem;color:var(--black)", text: String((w.voters || []).length) }),
        h("span", { style: "min-width:0" }, h("b", { text: w.title }), h("span", { text: (w.software || "") + " · " + (w.status || "Open") })))) : [h("p", { class: "empty", text: "No requests yet." })];
    } else {
      const items = newsItems().filter(n => tab === "News" ? n.kind === "OFFICE NEWS" : n.kind !== "HELP").slice(0, 4);
      rows = items.length ? items.map(feedRow) : [h("p", { class: "empty", text: tab === "News" ? "No office news yet." : "No updates yet." })];
    }
    box.replaceChildren(h("h3", { text: "What's new" }), seg, ...rows,
      h("a", { class: "link", href: tab === "Requests" ? "#/wishlist" : "#/news", style: "margin-top:.7rem" }, tab === "Requests" ? "See the wishlist  →" : "See all updates  →"));
  };
  paint();
  return box;
}
