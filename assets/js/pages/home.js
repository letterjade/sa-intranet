// Home: two jobs — open an office plugin, or open an office system.
import { h, icon, renderTopbar, renderBanner, searchBox } from "../ui.js";
import { state, activeWishes } from "../api.js";
import { pluginCard, addPluginCard, appTile, addShortcutTile, allLinks, newsItems, feedRow } from "./common.js";
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

  const plugins = [...state.data.plugins].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const main = h("div", { class: "stack" },
    h("div", { class: "section-head" },
      h("div", { class: "t" }, h("h2", { text: "Office plugins" }), h("p", { text: "Plugins made in our office. Click one to see what each button does." })),
      h("a", { class: "btn", href: "#/plugins" }, "All office plugins  →")),
    h("div", { class: "cards" }, plugins.slice(0, 3).map(pluginCard), plugins.length < 3 ? addPluginCard() : null),
    h("div", { class: "spacer" }),
    h("div", { class: "section-head" },
      h("div", { class: "t" }, h("h2", { text: "Office systems" }), h("p", { text: "Click a tile to open it." }))),
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
