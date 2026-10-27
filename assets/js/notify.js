// Alerts for new tools, updates, wishlist changes and office news.
// Settings are kept on each computer (no accounts).
// Real Windows pop-ups need the site on https:// (browser rule); on plain
// http:// we show the alert inside Snyder Hub instead.
import { h, icon } from "./ui.js";
import { state, local } from "./api.js";

const KINDS = [
  ["tools", "New tools and plugins", "Anything added to Office Plugins", ["NEW TOOL", "NEW PLUGIN"]],
  ["updates", "Updates to tools", "Fixes and new features", ["UPDATE"]],
  ["wishlist", "Wishlist", "New tool requests, and when one moves to Planned or Done", ["WISHLIST"]],
  ["help", "Install help requests", "When someone asks for help installing a plugin", ["HELP"]],
  ["news", "Office news", "Announcements for the office", ["OFFICE NEWS"]],
];
const DEFAULTS = { on: false, kinds: { tools: true, updates: true, wishlist: true, help: false, news: true } };
export const settings = () => ({ ...DEFAULTS, ...local.get("sa.alerts", {}), kinds: { ...DEFAULTS.kinds, ...(local.get("sa.alerts", {}).kinds || {}) } });
const save = s => local.set("sa.alerts", s);
const canPopUp = () => "Notification" in window && window.isSecureContext;

export async function turnOn() {
  const s = settings(); s.on = true; save(s);
  if (canPopUp() && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
  if (!local.get("sa.alertsSeen")) local.set("sa.alertsSeen", Date.now());
}
export function turnOff() { const s = settings(); s.on = false; save(s); }

/** Called whenever new data arrives. Shows each new item once. */
export function checkForNew() {
  const s = settings(); if (!s.on) return;
  const seen = local.get("sa.alertsSeen", Date.now());
  const fresh = state.data.news.filter(n => (n.createdAt || 0) > seen).sort((a, b) => a.createdAt - b.createdAt);
  if (!fresh.length) return;
  local.set("sa.alertsSeen", fresh[fresh.length - 1].createdAt);
  for (const n of fresh) {
    const k = KINDS.find(k => k[3].includes(n.kind)); if (k && !s.kinds[k[0]]) continue;
    show(n);
  }
}
function show(n) {
  const title = { "NEW TOOL": "New in Office Plugins", "NEW PLUGIN": "New plugin", "UPDATE": "Tool update", "WISHLIST": "Wishlist", "HELP": "Install help request", "OFFICE NEWS": "Office news" }[n.kind] || "Snyder Hub";
  if (canPopUp() && Notification.permission === "granted") {
    const note = new Notification(title, { body: n.title, icon: "favicon.svg", tag: n.id });
    note.onclick = () => { window.focus(); location.hash = n.plugin ? "#/plugin/" + n.plugin : "#/news"; };
    return;
  }
  const pop = h("div", { class: "alertpop", role: "status" }, h("span", { class: "thumb", style: "background:var(--teal);color:#fff;border:0", text: "S" }),
    h("div", { style: "flex:1;min-width:0" }, h("b", { text: title }), h("p", { text: n.title }),
      h("a", { class: "link", href: n.plugin ? "#/plugin/" + n.plugin : "#/news", onclick: () => pop.remove() }, "Open")),
    h("button", { class: "close", type: "button", "aria-label": "Dismiss", style: "width:1.8rem;height:1.8rem;font-size:.8rem", onclick: () => pop.remove() }, "✕"));
  document.body.append(pop);
  setTimeout(() => pop.remove(), 15000);
}

/** The small line under the Home side panel. */
export function alertsLine() {
  const s = settings();
  return h("div", { class: "notice" }, icon("bell"), s.on ? "Alerts are on for this computer." : "Pop-up alerts for new tools:",
    h("a", { class: "link", href: "#/news" }, s.on ? "Change" : "Turn on"));
}

/** Settings panel on the What's New page. */
export function settingsPanel(onChange) {
  const s = settings();
  const tg = h("button", { class: "toggle", type: "button", role: "switch", "aria-checked": s.on, "aria-label": "Alerts on or off",
    onclick: async () => { if (settings().on) turnOff(); else await turnOn(); onChange(); } });
  const rows = KINDS.map(([key, name, desc]) => h("label", { class: "check", style: "padding:.7rem 0;border-top:1px solid var(--soft-line)" },
    h("input", { type: "checkbox", checked: s.kinds[key], onchange: e => { const x = settings(); x.kinds[key] = e.target.checked; save(x); } }),
    h("span", null, h("b", { style: "display:block;font-weight:500", text: name }), h("small", { class: "muted", style: "font-size:.82rem", text: desc }))));
  const popupNote = canPopUp()
    ? (("Notification" in window && Notification.permission === "denied") ? "Your browser is blocking pop-ups for this site. Allow notifications in the browser's site settings." : "Pop-ups appear in the corner of your screen, even when Snyder Hub is in a background tab.")
    : "Alerts appear in the corner of Snyder Hub while it's open in a browser tab.";
  return h("div", { class: "panel", style: "gap:.6rem" },
    h("div", { style: "display:flex;align-items:center;gap:.8rem" }, icon("bell"), h("h3", { style: "flex:1;margin:0", text: "Alerts" }), tg),
    h("p", { style: "color:var(--body);font-size:.95rem", text: "Choose what you'd like to hear about. This is saved on this computer only." }),
    ...rows,
    h("p", { class: "muted", style: "font-size:.82rem;margin-top:.4rem", text: popupNote }));
}
