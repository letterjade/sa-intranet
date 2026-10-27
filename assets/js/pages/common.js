// Pieces used on more than one page: plugin cards, app tiles, the
// "Add a shortcut" window and the "What's new" list.
import { h, icon, img, sw, initials, openModal, closeModal, modalHead, field, toast, ICON_CHOICES, COLOR_CHOICES, when } from "../ui.js";
import { state, toolsOf, upsert, remove, newId, local, canEdit, pluginById } from "../api.js";

// ---------- plugin card ----------
export function pluginCard(p) {
  const s = sw(p.software), n = toolsOf(p.id).length;
  return h("a", { class: "pcard " + s.cls, href: "#/plugin/" + encodeURIComponent(p.id) },
    h("div", { class: "top" },
      h("span", { class: "logo" }, img(p.logo, () => h("span", { class: "letter", text: (p.name || "?")[0] }))),
      h("div", { style: "min-width:0" }, h("div", { class: "swline", text: "For " + (s.label || s.id) }), h("h3", { text: p.name }))),
    h("div", { class: "author" }, h("span", { class: "initials", text: initials(p.madeBy) }), "Made by " + (p.madeBy || "someone in the office")),
    p.description ? h("p", { class: "desc", text: p.description }) : null,
    h("span", { class: "btn" }, n ? `See its ${n} ${n === 1 ? "tool" : "tools"}  →` : "See it  →"));
}
export function addPluginCard(software) {
  const label = software ? "Add a " + software + " plugin" : "Add your plugin";
  return h("a", { class: "addcard", href: "#/plugins/new" + (software ? "/" + software : "") },
    h("span", { class: "plus", text: "+" }), h("b", { style: "font-weight:500;font-size:1.27rem", text: label }), h("small", { text: "Share a tool you built" }));
}

// ---------- office system tiles ----------
export function allLinks() {
  const shared = state.data.links.map(l => ({ ...l, scope: "everyone" }));
  const mine = local.get("sa.myLinks", []).map(l => ({ ...l, scope: "me" }));
  return [...shared, ...mine].sort((a, b) => (a.order ?? 1e15) - (b.order ?? 1e15));
}
const safeHref = u => (/^(https?:\/\/|\.{0,2}\/|#)/i.test(u || "") ? u : null);
export function appTile(l, { big = false } = {}) {
  const href = safeHref(l.url);
  const showUrl = (() => { try { const x = new URL(l.url); return x.host + (x.pathname === "/" ? "" : x.pathname); } catch (e) { return l.url || ""; } })();
  return h(href ? "a" : "div", { class: "tile c-" + (l.color || "teal") + (big ? " big" : ""), href, title: l.url || "" },
    h("span", { class: "ib" }, icon(l.glyph)),
    h("span", { class: "tx" }, h("b", { text: l.name }), h("span", { text: l.description || "" }), big ? h("span", { class: "url", text: showUrl }) : null),
    l.scope === "me" ? h("span", { class: "mine", text: "only me" }) : null,
    h("span", { class: "arrow", text: "→" }));
}
export function addShortcutTile() {
  return h("button", { class: "addtile", type: "button", onclick: () => shortcutWindow() }, h("span", { class: "p", text: "+" }), "Add a shortcut");
}

/** The "Add a shortcut" window. Just me → saved on this computer; Everyone → saved on the server. */
export function shortcutWindow(existing, onDone) {
  let color = existing?.color || "blue", glyph = existing?.glyph || "link", scope = existing?.scope || "me";
  const name = h("input", { id: "scName", maxlength: "40", value: existing?.name || "", placeholder: "e.g. Timesheets" });
  const url = h("input", { id: "scUrl", maxlength: "500", value: existing?.url || "", placeholder: "http://192.168.100.3/…", style: "font-family:var(--mono)" });
  const desc = h("input", { id: "scDesc", maxlength: "60", value: existing?.description || "", placeholder: "One short line (optional)" });
  const err = h("p", { class: "err" });
  const colors = h("div", { class: "swatches" });
  const paintColors = () => colors.replaceChildren(...COLOR_CHOICES.map(c => h("button", { type: "button", class: "c-" + c, style: "background:var(--c)", "aria-label": c, "aria-pressed": c === color, onclick: () => { color = c; paintColors(); } }, c === color ? "✓" : "")));
  paintColors();
  const icons = h("div", { class: "swatches" });
  const paintIcons = () => icons.replaceChildren(...ICON_CHOICES.map(g => h("button", { type: "button", style: "background:" + (g === glyph ? "var(--teal-tint)" : "var(--soft)") + ";color:var(--black)", "aria-label": g, "aria-pressed": g === glyph, onclick: () => { glyph = g; paintIcons(); } }, icon(g))));
  paintIcons();
  const who = h("div", { class: "who" });
  const paintWho = () => who.replaceChildren(...[["me", "Just me", "Only on this computer"], ["everyone", "Everyone", "Shows on everyone's Home"]].map(([v, t, d]) =>
    h("button", { type: "button", class: "choice", "aria-pressed": scope === v, disabled: v === "everyone" && !canEdit(), onclick: () => { scope = v; paintWho(); } }, h("span", null, h("b", { text: t }), h("small", { text: d })))));
  paintWho();
  const save = async () => {
    let u = url.value.trim(); if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
    if (!name.value.trim() || !u) { err.textContent = "Add a name and a web address."; return; }
    const item = { id: existing?.id || newId("l"), name: name.value.trim(), url: u, description: desc.value.trim(), color, glyph, group: existing?.group || "Shortcuts", order: existing?.order ?? Date.now() };
    try {
      if (scope === "me") {
        const mine = local.get("sa.myLinks", []).filter(x => x.id !== item.id); mine.push(item); local.set("sa.myLinks", mine);
        if (existing?.scope === "everyone") await remove("links", item.id);
      } else {
        await upsert("links", item);
        if (existing?.scope === "me") local.set("sa.myLinks", local.get("sa.myLinks", []).filter(x => x.id !== item.id));
      }
      closeModal(); toast("Shortcut saved"); onDone && onDone(); window.dispatchEvent(new Event("sa:refresh"));
    } catch (e) { err.textContent = e.message; }
  };
  const del = existing ? h("button", { class: "btn", type: "button", onclick: async () => {
    if (existing.scope === "me") local.set("sa.myLinks", local.get("sa.myLinks", []).filter(x => x.id !== existing.id)); else await remove("links", existing.id);
    closeModal(); toast("Shortcut removed"); window.dispatchEvent(new Event("sa:refresh")); } }, "Remove") : null;
  openModal([
    modalHead(existing ? "Edit shortcut" : "Add a shortcut"),
    field("Name on the tile", name),
    field("Web address", url, "Open the page in your browser, copy what's in the address bar, and paste it here."),
    field("Short description", desc),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Colour" }), colors),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Picture" }), icons),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Who sees it?" }), who),
    err,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", style: "flex:1", onclick: save }, existing ? "Save" : "Add shortcut"), del, h("button", { class: "btn", type: "button", onclick: closeModal }, "Cancel")),
  ], { narrow: true });
  name.focus();
}

// ---------- news ----------
export const KIND_ORDER = ["NEW TOOL", "NEW PLUGIN", "UPDATE", "WISHLIST", "OFFICE NEWS", "HELP"];
export function newsItems() { return [...state.data.news].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
export function newsThumb(n) {
  const p = n.plugin ? pluginById(n.plugin) : null;
  const t = n.tool ? state.data.tools.find(x => x.id === n.tool) : null;
  return h("span", { class: "thumb" }, img(n.icon || t?.icon || p?.logo, () => h("span", { text: n.kind === "OFFICE NEWS" ? "SA" : "★" })));
}
export function newsLink(n) { return n.plugin ? "#/plugin/" + encodeURIComponent(n.plugin) : n.wish ? "#/wishlist" : "#/news"; }
export function feedRow(n) {
  return h("a", { class: "feed-row", href: newsLink(n) }, newsThumb(n),
    h("span", { style: "min-width:0" }, h("b", { text: n.title }), h("span", { text: [n.by, when(n.createdAt)].filter(Boolean).join(" · ") })));
}
export function postNews(item) { return upsert("news", { id: newId("n"), createdAt: Date.now(), ...item }); }
