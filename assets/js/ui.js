// ---------------------------------------------------------------------------
// Small UI helpers shared by every page.
// ---------------------------------------------------------------------------
import { state, isAdminHere, local } from "./api.js";

/** h("div", {class:"x", onclick:fn}, child, "text", [more]) → element. Text is always escaped. */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, k.startsWith("aria-") ? "true" : "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// 24px line icons (same set as the Figma file)
const GLYPHS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14 M20 20l-4-4",
  briefcase: "M3 7h18v13H3z M8 7V4h8v3 M3 12h18",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21a7 7 0 0 1 14 0 M17 4a3.5 3.5 0 0 1 0 7 M19 21a6 6 0 0 0-3-5",
  hammer: "M14 4l6 6-3 3-6-6z M11 7 3 15l3 3 8-8",
  books: "M4 4h4v16H4z M10 4h4v16h-4z M16 5l3.5-1 3 15.5-3.5 1z",
  book: "M2 5h7a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H2z M22 5h-7a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H22z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 7v5l3.5 2",
  cloud: "M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z",
  grid: "M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  folder: "M3 6h6l2 2h10v11H3z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4",
  mail: "M3 5h18v14H3z M3 6l9 7 9-7",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0",
  sheet: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7",
  dollar: "M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
};
export const ICON_CHOICES = ["briefcase", "people", "hammer", "books", "book", "clock", "cloud", "grid", "globe", "lock", "folder", "link", "chart", "calendar", "mail", "sheet", "dollar", "bolt"];
export const COLOR_CHOICES = ["teal", "blue", "green", "amber", "red", "purple", "gray", "slate"];

export function icon(name) {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "icon"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", GLYPHS[name] || GLYPHS.link); s.append(p);
  return s;
}

/** Only local images (icons/…, uploads/…) are shown. */
export function img(src, fallback) {
  if (!/^(icons|uploads)\/[\w .&()+\-\/]+$/i.test(src || "")) return fallback ? fallback() : null;
  const i = h("img", { src, alt: "", loading: "lazy" });
  i.addEventListener("error", () => { if (fallback) i.replaceWith(fallback()); else i.remove(); });
  return i;
}

export const SOFTWARE = [
  { id: "Revit", cls: "sw-revit", help: "Plugins that run inside Revit", sub: "pyRevit, add-ins" },
  { id: "AutoCAD", cls: "sw-autocad", help: "LISP routines and add-ins for AutoCAD", sub: "LISP routines" },
  { id: "Rhino", cls: "sw-rhino", help: "Plugins and Grasshopper scripts for Rhino", sub: "scripts, components", label: "Rhino / Grasshopper" },
  { id: "Other", cls: "sw-other", help: "Anything else", sub: "anything else" },
];
export const sw = id => SOFTWARE.find(s => s.id === id) || SOFTWARE[3];

export const initials = name => String(name || "?").replace(/^made by\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}

/** Copy that also works on plain http:// addresses. */
export function copyText(text, msg = "Copied") {
  const legacy = () => {
    const ta = h("textarea", { style: "position:fixed;top:0;left:0;opacity:0" }); ta.value = text;
    document.body.append(ta); ta.select(); let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove(); toast(ok ? msg : "Select the text and press Ctrl+C");
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(msg), legacy);
  else legacy();
}

export function when(ts) {
  if (!ts) return "";
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + (Math.round(s / 3600) === 1 ? " hour ago" : " hours ago");
  if (s < 172800) return "yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EXT = { docx: ["DOC", "#2b579a"], doc: ["DOC", "#2b579a"], xlsx: ["XLS", "#217346"], xls: ["XLS", "#217346"], csv: ["CSV", "#217346"], pdf: ["PDF", "#c4302b"], dwg: ["DWG", "#c0392b"], rvt: ["RVT", "#1c64a8"], rfa: ["RFA", "#1c64a8"], zip: ["ZIP", "#3c3d40"], lsp: ["LSP", "#c0392b"], gh: ["GH", "#3d4148"], ghuser: ["GH", "#3d4148"] };
/** A file reference: a server path (copy it) or an uploaded file (open it). */
export function fileRef(f, extra) {
  const p = f.path || "";
  const isUp = f.kind === "upload", isUrl = /^https?:\/\//i.test(p);
  const name = f.name || p.split(/[\\/]/).filter(Boolean).pop() || p;
  const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const [lab, col] = EXT[ext] || [(ext || "FILE").slice(0, 4).toUpperCase(), "#5b6672"];
  return h("div", { class: "file" },
    h("span", { class: "ftype", style: "--fc:" + col, text: lab }),
    h("div", { class: "fm" }, h("b", { text: name }), h("code", { text: isUp ? "Uploaded to SA Intranet" : p })),
    isUp || isUrl ? h("a", { class: "btn small", href: p, target: "_blank", rel: "noopener" }, "Open")
                  : h("button", { class: "btn small", type: "button", onclick: () => copyText(p, "Path copied. Paste it into File Explorer.") }, "Copy path"),
    extra || null);
}

// ---- page chrome ----
const TABS = [["Home", "#/"], ["Office Plugins", "#/plugins"], ["Office Systems", "#/systems"], ["Wishlist", "#/wishlist"], ["What's New", "#/news"]];
export function renderTopbar(active) {
  const bar = document.getElementById("topbar");
  bar.replaceChildren(h("div", { class: "wrap" },
    h("a", { class: "brand", href: "#/" }, h("span", { class: "s", text: "S" }), h("b", { text: "SA INTRANET" })),
    h("nav", { class: "tabs", "aria-label": "Main" }, TABS.map(([n, href]) =>
      h("a", { class: "tab", href, "aria-current": n === active ? "page" : null, text: n })),
      isAdminHere() ? adminTab(active === "Admin") : null)));
}
/** Only on a browser where the admin PIN was entered. The red number = things waiting for you. */
export function adminWaiting() {
  const seen = local.get("sa.adminSeen", 0);
  const help = state.data.help.filter(x => !x.done).length;
  const wishes = state.data.wishes.filter(w => (w.status || "Open") === "Open" && (w.createdAt || 0) > seen).length;
  return { help, wishes, total: help + wishes };
}
function adminTab(current) {
  const n = adminWaiting().total;
  return h("a", { class: "tab admin-tab", href: "#/admin", "aria-current": current ? "page" : null, title: n ? n + " waiting for you" : "Admin" },
    "Admin", n ? h("span", { class: "count", text: String(n) }) : null);
}
export function renderBanner(...content) {
  document.getElementById("banner").replaceChildren(content.length ? h("section", { class: "banner" }, h("div", { class: "wrap" }, ...content)) : "");
}
export function searchBox(value = "", placeholder = "Search for a tool or a system…") {
  const input = h("input", { type: "search", id: "q", value, placeholder, "aria-label": "Search", autocomplete: "off" });
  const form = h("form", { class: "search", role: "search", onsubmit: e => { e.preventDefault(); const q = input.value.trim(); location.hash = q ? "#/search/" + encodeURIComponent(q) : "#/"; } },
    icon("search"), input);
  return form;
}

// ---- modal ----
export function openModal(content, { narrow = false } = {}) {
  const d = document.getElementById("modal");
  d.className = narrow ? "narrow" : "";
  d.replaceChildren(h("div", { class: "mbody" }, content));
  if (!d.open) d.showModal();
  return d;
}
export function closeModal() { const d = document.getElementById("modal"); if (d.open) d.close(); }
export function modalHead(title, sub, logo) {
  return h("div", { class: "mhead" }, logo || null,
    h("div", { class: "grow" }, h("h2", { text: title }), sub ? h("p", { text: sub }) : null),
    h("button", { class: "close", type: "button", "aria-label": "Close", onclick: closeModal }, "✕"));
}

export function field(label, input, hint) {
  return h("div", { class: "field" }, h("label", { for: input.id || null, text: label }), input, hint ? h("span", { class: "hint", text: hint }) : null);
}
