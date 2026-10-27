// Office Systems: every office web app with its address, in groups.
import { h, renderTopbar, renderBanner } from "../ui.js";
import { canEdit } from "../api.js";
import { allLinks, appTile, addShortcutTile, shortcutWindow } from "./common.js";

const GROUP_ORDER = ["Office records", "Staff", "Files and website", "Shortcuts"];

export function render(root) {
  renderTopbar("Office Systems");
  renderBanner(h("div", { class: "grow" }, h("h1", { text: "Office systems" }), h("p", { class: "sub", text: "Every app we use, with its address. Click a tile to open it." })));
  const links = allLinks();
  const groups = [...new Set([...GROUP_ORDER, ...links.map(l => l.scope === "me" ? "My shortcuts" : l.group || "Shortcuts")])];
  const out = [];
  for (const g of [...groups, "My shortcuts"].filter((x, i, a) => a.indexOf(x) === i)) {
    const items = links.filter(l => (l.scope === "me" ? "My shortcuts" : l.group || "Shortcuts") === g);
    if (!items.length) continue;
    out.push(h("div", { class: "rule-head" }, h("h3", { text: g }), h("span", { class: "line" })),
      h("div", { class: "tiles", style: "grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))" }, items.map(l => {
        const t = appTile(l, { big: true });
        if (l.scope === "me" || canEdit()) {
          const edit = h("button", { class: "link", type: "button", style: "font-size:.77rem;align-self:flex-start", onclick: e => { e.preventDefault(); shortcutWindow(l); } }, "Edit");
          return h("div", { class: "stack", style: "gap:.3rem" }, t, edit);
        }
        return t;
      })));
  }
  out.push(h("div", { class: "tiles", style: "grid-template-columns:repeat(auto-fill,minmax(22rem,1fr));margin-top:.6rem" }, addShortcutTile()));
  root.replaceChildren(h("div", { class: "wrap page stack", style: "gap:1.1rem" }, ...out));
}
