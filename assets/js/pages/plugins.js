// Office Plugins: every plugin, grouped by the software it runs in.
import { h, renderTopbar, renderBanner, searchBox, SOFTWARE } from "../ui.js";
import { state, canEdit } from "../api.js";
import { pluginCard, addPluginCard } from "./common.js";

export function render(root, filter) {
  renderTopbar("Office Plugins");
  renderBanner(
    h("div", { class: "grow" }, h("h1", { text: "Office plugins" }), h("p", { class: "sub", text: "Tools made by people in this office, sorted by the software they run in." })),
    searchBox("", "Search tools…  e.g. legend, leaders, rename"),
    canEdit() ? h("div", { class: "actions" }, h("a", { class: "btn on-dark", href: "#/wishlist" }, "Request a tool"), h("a", { class: "btn primary", href: "#/plugins/new" }, "+ Add your plugin")) : null);

  const want = SOFTWARE.find(s => s.id.toLowerCase() === String(filter || "").toLowerCase());
  const count = id => state.data.plugins.filter(p => (p.software || "Other") === id).length;
  const tabs = h("div", { class: "subtabs" },
    h("button", { type: "button", "aria-pressed": !want, onclick: () => (location.hash = "#/plugins") }, "All software  " + state.data.plugins.length),
    SOFTWARE.map(s => h("button", { type: "button", "aria-pressed": want === s, onclick: () => (location.hash = "#/plugins/" + s.id.toLowerCase()) }, (s.label || s.id) + "  " + count(s.id))));

  const sections = (want ? [want] : SOFTWARE).map(s => {
    const list = state.data.plugins.filter(p => (p.software || "Other") === s.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!list.length && s.id === "Other" && !want) return null;
    return h("section", { class: "stack " + s.cls, style: "gap:1.1rem" },
      h("div", { style: "display:flex;align-items:center;gap:.9rem" }, h("span", { class: "swmark", text: s.id[0] }),
        h("div", null, h("h2", { style: "font-size:2rem", text: "For " + (s.label || s.id) }), h("p", { class: "muted", text: s.help }))),
      s.id === "Revit" ? pyRevitSetup() : null,
      h("div", { class: "cards" }, list.map(pluginCard), canEdit() ? addPluginCard(s.id) : (list.length ? null : h("p", { class: "empty", text: "Nothing here yet." }))));
  });
  root.replaceChildren(h("div", { class: "wrap page stack", style: "gap:2.9rem;padding-top:0" }, tabs, ...sections));
}

function pyRevitSetup() {
  const external = (href, text) => h("a", { class: "btn", href, target: "_blank", rel: "noopener noreferrer" }, text);
  return h("div", { class: "panel pyrevit-setup" },
    h("div", { class: "section-head" },
      h("div", { class: "t" }, h("h3", { text: "Start here: install pyRevit" }),
        h("p", { text: "All our Revit plugins run through pyRevit. Install it once, then add each office plugin." })),
      external("https://github.com/pyrevitlabs/pyRevit/releases", "Download pyRevit ↗")),
    h("details", null, h("summary", { class: "link", text: "Show installation steps" }),
      h("ol", { class: "steps" },
        h("li", { text: "Close Revit. Open the official downloads and choose an installer compatible with your Revit version. Use the office-approved version if IT has specified one." }),
        h("li", { text: "Run the installer and follow its setup prompts. Ask IT if installation needs administrator access." }),
        h("li", { text: "Open Revit and check that the pyRevit tab appears." }),
        h("li", { text: "Open an office plugin below and click Install. Add its shared parent folder in pyRevit Settings › Custom Extension Directories, then save and reload." })),
      h("p", { class: "muted", text: "Already see the pyRevit tab? Skip the download and follow the office plugin’s Install instructions." }),
      external("https://github.com/pyrevitlabs/pyRevit", "Official pyRevit project ↗")));
}
