// One plugin: its tools grouped by ribbon panel, how to use each one,
// and the Install window (do it yourself, or ask for help).
import { h, icon, img, sw, renderTopbar, renderBanner, openModal, closeModal, modalHead, copyText, toast, field, when } from "../ui.js";
import { state, pluginById, toolsOf, canEdit, upsert, remove, newId } from "../api.js";
import { postNews, newsItems, feedRow } from "./common.js";

let selected = null, view = "tools", lastPlugin = null;

export function render(root, id) {
  const p = pluginById(id);
  renderTopbar("Office Plugins");
  if (!p) { renderBanner(h("div", { class: "grow" }, h("h1", { text: "Plugin not found" }))); root.replaceChildren(h("div", { class: "wrap page" }, h("a", { class: "btn", href: "#/plugins" }, "← All office plugins"))); return; }
  if (lastPlugin !== id) { selected = null; view = "tools"; lastPlugin = id; }
  const s = sw(p.software), tools = toolsOf(p.id);
  if (!selected || !tools.find(t => t.id === selected)) selected = tools[0]?.id || null;

  renderBanner(h("div", { class: "grow" },
    h("div", { class: "crumbs" }, h("a", { href: "#/plugins", text: "Office Plugins" }), "/", h("a", { href: "#/plugins/" + s.id.toLowerCase(), text: s.label || s.id }), "/", h("span", { text: p.name })),
    h("div", { class: "ph " + s.cls },
      h("span", { class: "logo" }, img(p.logo, () => h("span", { class: "letter", text: p.name[0] }))),
      h("div", { class: "grow" },
        h("span", { class: "badge", text: s.label || s.id }),
        h("h1", { style: "font-size:2.73rem;margin-top:.4rem", text: p.name }),
        h("p", { class: "meta", text: [p.runsIn || "For " + s.id, p.version ? "v" + p.version : "", "made by " + (p.madeBy || "someone in the office")].filter(Boolean).join("  ·  ") }),
        p.about || p.description ? h("p", { class: "about", text: p.about || p.description }) : null,
        h("div", { class: "actions" },
          h("button", { class: "btn primary", type: "button", onclick: () => installWindow(p) }, "Install"),
          h("a", { class: "btn on-dark", href: "#/wishlist" }, "Request a tool for this plugin"),
          canEdit() ? h("a", { class: "btn on-dark", href: "#/plugin/" + encodeURIComponent(p.id) + "/edit" }, "Edit") : null)))));

  const tabs = h("div", { class: "subtabs" }, [["tools", "Tools  " + tools.length], ["install", "Install"], ["changes", "What's changed"]].map(([k, l]) =>
    h("button", { type: "button", "aria-pressed": view === k, onclick: () => { view = k; render(root, id); } }, l)));

  let left;
  if (view === "install") left = h("div", { class: "stack " + s.cls }, installSteps(p), h("div", null, helpBox(p)));
  else if (view === "changes") { const items = newsItems().filter(n => n.plugin === p.id); left = h("div", { class: "panel" }, items.length ? items.map(feedRow) : h("p", { class: "empty", text: "No changes posted yet." })); }
  else left = toolsList(p, tools, root, id);

  const t = tools.find(x => x.id === selected);
  const right = h("aside", { class: "detail " + s.cls }, t ? toolDetail(p, t) : h("div", { class: "panel" }, h("p", { class: "empty", text: "No tools listed yet." })), getIt(p));
  root.replaceChildren(h("div", { class: "wrap page", style: "padding-top:0" }, tabs, h("div", { class: "cols", style: "margin-top:1.8rem" }, left, view === "tools" ? right : h("aside", { class: "detail " + s.cls }, getIt(p)))));
}

function toolsList(p, tools, root, id) {
  const s = sw(p.software);
  const box = h("div", { class: "stack " + s.cls, style: "gap:1.2rem" });
  const flow = (p.workflow || []).filter(Boolean);
  if (flow.length) box.append(h("div", { class: "flow" }, h("div", { class: "label", text: "Recommended order" }),
    h("ol", null, flow.map((n, i) => { const t = tools.find(x => x.name.toLowerCase() === n.toLowerCase());
      return h("li", null, h("button", { type: "button", onclick: () => { if (t) { selected = t.id; render(root, id); document.getElementById("tool-" + t.id)?.scrollIntoView({ block: "center", behavior: "smooth" }); } } },
        h("span", { class: "no", text: String(i + 1) }), t ? img(t.icon) : null, n)); }))));
  const panels = [...new Set(tools.map(t => t.panel || ""))];
  for (const pn of panels) {
    const items = tools.filter(t => (t.panel || "") === pn);
    box.append(h("div", { class: "rule-head" }, h("span", { class: "label", text: (pn || "Tools") + (pn ? " panel" : "") }), h("span", { class: "line" }), h("span", { class: "n", text: items.length + (items.length === 1 ? " tool" : " tools") })),
      h("div", { class: "tools" }, items.map(t => h("button", { class: "tcard", id: "tool-" + t.id, type: "button", "aria-pressed": t.id === selected, onclick: () => { selected = t.id; render(root, id); } },
        h("div", { class: "top" }, h("span", { class: "ti" }, img(t.icon, () => icon("bolt"))),
          h("div", { class: "nm" }, h("h4", { text: t.name }), h("div", { class: "panelname", text: (t.panel || "") + (t.panel ? " panel" : "") })), t.beta ? h("span", { class: "beta", text: "BETA" }) : null),
        h("p", { class: "short", text: t.short || t.description || "" }),
        h("span", { class: "how", text: "How to use  →" })))));
  }
  if (!tools.length) box.append(h("p", { class: "empty", text: "No tools listed yet." }));
  return box;
}

function toolDetail(p, t) {
  const steps = String(t.howto || "").split(/\n+/).map(x => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  return h("div", { class: "panel" },
    h("span", { class: "eyebrow", text: "Selected tool" }),
    h("div", { class: "hd" }, h("span", { class: "big" }, img(t.icon, () => icon("bolt"))), h("div", { style: "min-width:0" }, h("h3", { text: t.name }), h("div", { class: "where", text: t.command || [p.name, t.panel, t.name].filter(Boolean).join(" › ") }))),
    h("p", { class: "what", text: t.description || t.short || "" }),
    steps.length ? [h("b", { style: "font-weight:500;font-size:1.18rem;margin-top:.4rem", text: "How to use" }), h("ol", { class: "steps" }, steps.map(x => h("li", { text: x })))] : null,
    t.beta ? h("p", { class: "note", text: "Beta: still being tested. Tell " + (p.madeBy || "the maker") + " if something looks wrong." }) : null);
}

function getIt(p) {
  return h("div", { class: "panel soft", style: "gap:.7rem" },
    h("span", { class: "eyebrow", style: "color:var(--gray)", text: "Get it" }),
    h("p", { style: "font-size:.95rem;color:var(--body)", text: "Click Install for step-by-step instructions, or ask " + (p.madeBy || "the maker") + " to set it up for you." }),
    h("button", { class: "btn primary", type: "button", onclick: () => installWindow(p) }, "Install"));
}

// ---------- install ----------
function parentFolder(path) { const parts = String(path || "").replace(/[\\/]+$/, "").split(/[\\]/); return parts.length > 1 ? parts.slice(0, -1).join("\\") : path; }

function installSteps(p) {
  const s = sw(p.software);
  const copyBox = text => h("div", { class: "copybox" }, h("code", { text }), h("button", { class: "btn primary", type: "button", onclick: () => copyText(text, "Path copied") }, "Copy path"));
  const download = () => p.package?.path
    ? h("div", { class: "file", style: "max-width:none;background:#fff" }, h("span", { class: "ftype", style: "--fc:#3c3d40", text: "ZIP" }),
        h("div", { class: "fm" }, h("b", { text: p.package.name || "Package" }), h("code", { text: p.package.size ? Math.max(1, Math.round(p.package.size / 1024)) + " KB · on the SA Intranet server" : "on the SA Intranet server" })),
        h("a", { class: "btn primary", href: p.package.path, download: p.package.name || true }, "Download"))
    : h("p", { class: "note", text: "The package hasn't been uploaded yet. Use “Ask for help”." });
  const li = (...kids) => h("li", null, h("div", { class: "tx" }, ...kids));
  let steps;
  if (s.id === "Revit") {
    const folder = p.location ? parentFolder(p.location) : "";
    steps = [
      li(h("span", null, "Open Revit and check you have a ", h("kbd", { text: "pyRevit" }), " tab at the top. No pyRevit tab? Use “Ask for help”.")),
      li(h("span", { text: "Copy our plugin folder path:" }), folder ? copyBox(folder) : h("p", { class: "note", text: "The server folder isn't set yet. Use “Ask for help”." })),
      li(h("span", null, "In Revit click ", h("kbd", { text: "pyRevit" }), " › ", h("kbd", { text: "Settings" }), ". Find ", h("b", { style: "font-weight:500", text: "Custom Extension Directories" }), ", click ", h("kbd", { text: "Add folder" }), ", paste the path, then click ", h("kbd", { text: "Save Settings" }), "."),
        h("div", { class: "mock", "aria-hidden": "true" }, h("b", { text: "pyRevit Settings" }), h("span", { text: "Custom Extension Directories" }), h("div", { class: "list" }, h("span", { class: "hl", text: folder || "\\\\server\\folder" })),
          h("div", { class: "bt" }, h("span", { class: "on", text: "Add folder" }), h("span", { text: "Remove" }), h("span", { class: "on", text: "Save Settings" })))),
      li(h("span", null, "Click ", h("kbd", { text: "pyRevit" }), " › ", h("kbd", { text: "Reload" }), ". A new ", h("b", { style: "font-weight:500", text: p.name }), " tab appears in Revit. Done.")),
    ];
  } else if (s.id === "AutoCAD") {
    steps = [
      li(h("span", { text: "Download the package:" }), download()),
      li(h("span", null, "Unzip it into ", h("kbd", { text: "C:\\SA\\Lisp" }), " (make the folder if it isn't there).")),
      li(h("span", { text: "In AutoCAD, type this and press Enter:" }), h("span", { class: "typethis", text: "APPLOAD" })),
      li(h("span", null, "Under ", h("b", { style: "font-weight:500", text: "Startup Suite" }), " click ", h("kbd", { text: "Contents…" }), " › ", h("kbd", { text: "Add…" }), ", pick the ", h("kbd", { text: ".lsp" }), " file, then ", h("kbd", { text: "Close" }), ". It now loads every time AutoCAD starts.")),
      p.command ? li(h("span", { text: "Type the command to run it:" }), h("span", { class: "typethis", text: p.command })) : null,
    ];
  } else if (s.id === "Rhino") {
    steps = [
      li(h("span", { text: "Download the scripts:" }), download()),
      li(h("span", null, "To use a script: in Grasshopper click ", h("kbd", { text: "File" }), " › ", h("kbd", { text: "Open" }), " and pick the ", h("kbd", { text: ".gh" }), " file.")),
      li(h("span", null, "To add components to your toolbar: in Grasshopper click ", h("kbd", { text: "File" }), " › ", h("kbd", { text: "Special Folders" }), " › ", h("kbd", { text: "User Object Folder" }), " and copy the ", h("kbd", { text: ".ghuser" }), " files into it.")),
      li(h("span", { text: "Restart Rhino. The new components appear in the Grasshopper toolbar." })),
    ];
  } else {
    steps = [p.package?.path ? li(h("span", { text: "Download it:" }), download()) : null];
  }
  if (p.installNotes) steps.push(li(h("span", { style: "white-space:pre-wrap", text: p.installNotes })));
  return h("div", { class: "stack", style: "gap:.9rem" },
    h("div", { style: "display:flex;align-items:center;gap:.7rem" }, h("h3", { style: "font-size:1.45rem", text: "Do it yourself" }), h("span", { class: "pill", text: "about 3 minutes" })),
    h("ol", { class: "isteps" }, steps.filter(Boolean)));
}

function helpBox(p) {
  const name = h("input", { id: "hName", maxlength: "60", placeholder: "e.g. Priya", value: localStorage.getItem("sa.name") || "" });
  const where = h("input", { id: "hWhere", maxlength: "80", placeholder: "e.g. 3rd floor, by the window" });
  const err = h("p", { class: "err" });
  const who = p.madeBy || "Someone who knows the plugin";
  const ask = async () => {
    if (!name.value.trim()) { err.textContent = "Type your name so they know who to help."; return; }
    try { localStorage.setItem("sa.name", name.value.trim()); } catch (e) { /* ignore */ }
    try {
      const id = newId("h");
      await upsert("help", { id, plugin: p.id, name: name.value.trim(), where: where.value.trim(), done: false });
      await postNews({ kind: "HELP", plugin: p.id, title: name.value.trim() + " needs help installing " + p.name, body: where.value.trim() ? "Sits at: " + where.value.trim() : "", by: name.value.trim() });
      closeModal(); toast("Sent. " + (p.madeBy || "They") + " will see your request.");
    } catch (e) { err.textContent = e.message; }
  };
  if (!p.helpOn && p.helpOn !== undefined) return h("div", { class: "panel tint" }, h("h3", { text: "Need help?" }), h("p", { text: "Ask " + who + " or IT in person." }));
  return h("div", { class: "panel tint", style: "gap:.9rem;padding:1.6rem" },
    h("h3", { style: "font-size:1.45rem", text: "Prefer some help?" }),
    h("p", { style: "color:var(--body)", text: who + " can set it up at your desk. It takes a few minutes." }),
    field("Your name", name), field("Where you sit (optional)", where), err,
    h("button", { class: "btn primary block", type: "button", disabled: !canEdit(), onclick: ask }, "Ask for help"),
    h("p", { class: "muted", style: "font-size:.82rem", text: "It shows up in What's New, and as an alert for anyone who turned on help alerts." }));
}

export function installWindow(p) {
  const s = sw(p.software);
  openModal([
    modalHead("Install " + p.name, "For " + (s.label || s.id) + (s.id === "Revit" ? "  ·  you point pyRevit at our server folder once" : s.id === "AutoCAD" ? "  ·  a LISP package you add to your Startup Suite" : s.id === "Rhino" ? "  ·  scripts you open, or add to your toolbar" : ""),
      h("span", { class: "logo " + s.cls, style: "width:3.6rem;height:3.6rem" }, img(p.logo, () => h("span", { class: "letter", text: p.name[0] })))),
    h("div", { class: "two " + s.cls }, installSteps(p), helpBox(p)),
    h("p", { class: "muted", style: "font-size:.86rem", text: s.id === "Revit" ? "Already installed? New versions arrive by themselves from the server folder. Just click pyRevit › Reload." : "" }),
  ]);
}
