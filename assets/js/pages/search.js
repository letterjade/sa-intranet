// One search across tools, plugins, office systems, the wishlist and news.
import { h, icon, img, sw, renderTopbar, renderBanner, searchBox } from "../ui.js";
import { state, pluginById } from "../api.js";
import { pluginCard, appTile, allLinks } from "./common.js";

function score(words, fields) {
  let total = 0;
  for (const w of words) {
    let best = 0;
    for (const [text, weight] of fields) if (String(text || "").toLowerCase().includes(w)) best = Math.max(best, weight);
    if (!best) return 0;
    total += best;
  }
  return total;
}

export function render(root, q) {
  renderTopbar(null);
  renderBanner(h("div", { class: "grow" }, h("h1", { text: q ? "Results for “" + q + "”" : "Search" })), searchBox(q || ""));
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const tools = state.data.tools.map(t => [score(words, [[t.name, 10], [t.short, 6], [t.description, 4], [t.panel, 3], [pluginById(t.plugin)?.name, 2]]), t]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  const plugins = state.data.plugins.filter(p => score(words, [[p.name, 10], [p.description, 4], [p.madeBy, 3], [p.software, 3]]));
  const links = allLinks().filter(l => score(words, [[l.name, 10], [l.description, 4], [l.url, 1]]));
  const wishes = state.data.wishes.filter(w => score(words, [[w.title, 10], [w.details, 3]]));
  const head = (t, n) => h("div", { class: "rule-head" }, h("h3", { text: t }), h("span", { class: "n", text: n + (n === 1 ? " match" : " matches") }), h("span", { class: "line" }));
  const out = [];
  if (tools.length) out.push(head("Tools", tools.length), h("div", { class: "tools" }, tools.slice(0, 30).map(t => { const p = pluginById(t.plugin), s = sw(p?.software);
    return h("a", { class: "tcard " + s.cls, href: "#/plugin/" + encodeURIComponent(t.plugin), style: "text-decoration:none" },
      h("div", { class: "top" }, h("span", { class: "ti" }, img(t.icon, () => icon("bolt"))), h("div", { class: "nm" }, h("h4", { text: t.name }), h("div", { class: "panelname", text: (p?.name || "") + " · " + (s.label || s.id) }))),
      h("p", { class: "short", text: t.short || t.description || "" })); })));
  if (plugins.length) out.push(head("Plugins", plugins.length), h("div", { class: "cards" }, plugins.map(pluginCard)));
  if (links.length) out.push(head("Office systems", links.length), h("div", { class: "tiles" }, links.map(l => appTile(l))));
  if (wishes.length) out.push(head("Wishlist", wishes.length), h("div", { class: "stack" }, wishes.map(w => h("a", { class: "feed-row", href: "#/wishlist" }, h("span", { class: "thumb", text: String((w.voters || []).length) }), h("span", null, h("b", { text: w.title }), h("span", { text: (w.software || "") + " · " + (w.status || "Open") }))))));
  if (!out.length) out.push(h("p", { class: "empty", style: "font-size:1.09rem", text: words.length ? "Nothing matches that." : "Type what you're looking for." }));
  out.push(h("div", { class: "panel tint", style: "flex-direction:row;align-items:center;gap:1.2rem;flex-wrap:wrap;margin-top:1rem" },
    h("p", { style: "flex:1 1 20rem;font-size:1.09rem", text: "Didn't find the tool you need? Ask for it and the builders will see it." }),
    h("a", { class: "btn primary", href: "#/wishlist" }, "Request a tool")));
  root.replaceChildren(h("div", { class: "wrap page stack", style: "gap:1.1rem" }, ...out));
}
