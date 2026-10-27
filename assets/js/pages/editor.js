// Add or edit a plugin, in four short steps.
import { h, icon, img, sw, SOFTWARE, renderTopbar, renderBanner, toast, field } from "../ui.js";
import { state, pluginById, toolsOf, canEdit, batch, upload, scanExtension, newId, remove } from "../api.js";
import { pluginCard, postNews } from "./common.js";

let draft = null, draftKey = null;

function startDraft(id, software) {
  const p = id ? pluginById(id) : null;
  draft = p
    ? { ...JSON.parse(JSON.stringify(p)), tools: toolsOf(p.id).map(t => ({ ...t })), isNew: false, notify: false }
    : { id: newId("p"), name: "", madeBy: localStorage.getItem("sa.name") || "", software: software || "Revit", description: "", runsIn: "", version: "", location: "", package: null, command: "", installNotes: "", helpOn: true, logo: "", workflow: [], tools: [], isNew: true, notify: true };
  draftKey = (id || "new") + "|" + (software || "");
}

export function render(root, id, software) {
  renderTopbar("Office Plugins");
  if ((id || "new") + "|" + (software || "") !== draftKey || !draft) startDraft(id, software);
  const editing = !draft.isNew;
  renderBanner(h("div", { class: "grow" },
    h("div", { class: "crumbs" }, h("a", { href: "#/plugins", text: "Office Plugins" }), "/", h("span", { text: editing ? "Edit " + draft.name : "Add your plugin" })),
    h("h1", { text: editing ? "Edit " + draft.name : "Add your plugin" }),
    h("p", { class: "sub", text: "Four short steps. About 10 minutes." })));
  if (!canEdit()) { root.replaceChildren(h("div", { class: "wrap page" }, h("p", { class: "bad-box", text: "Adding plugins needs the SA Intranet server (server.py) to be running." }))); return; }

  const rerender = () => render(root, id, software);
  const s = sw(draft.software);
  const inp = (key, attrs = {}) => { const el = h(attrs.area ? "textarea" : "input", { id: "f-" + key, maxlength: attrs.max || "200", placeholder: attrs.ph || "", ...(attrs.mono ? { style: "font-family:var(--mono)" } : {}) }); el.value = draft[key] || ""; el.addEventListener("input", () => { draft[key] = el.value; if (attrs.live) paintPreview(); }); return el; };
  const section = (n, title, sub, ...kids) => h("section", { class: "card-section" }, h("div", { class: "sh" }, h("span", { class: "num", text: String(n) }), h("div", null, h("h3", { text: title }), sub ? h("p", { text: sub }) : null)), ...kids);

  // ---- step 1
  const choices = h("div", { class: "choices" }, SOFTWARE.map(x => h("button", { type: "button", class: "choice " + x.cls, "aria-pressed": draft.software === x.id, onclick: () => { draft.software = x.id; rerender(); } },
    h("span", { class: "swmark", text: x.id[0] }), h("span", null, h("b", { text: x.label || x.id }), h("small", { text: x.sub })))));
  const logoBtn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; try { const r = await upload(f); draft.logo = r.path; paintPreview(); toast("Icon uploaded"); } catch (er) { toast(er.message); } } });
  const step1 = section(1, "About your plugin", null,
    h("div", { class: "row" }, field("Plugin name", inp("name", { max: 80, ph: "e.g. Jade Cleaner", live: true })), field("Made by (your name)", inp("madeBy", { max: 80, ph: "e.g. Jade Wong", live: true }))),
    h("div", { class: "field" }, h("span", { class: "lbl", text: "Which software is it for?" }), choices),
    field("What does it do? One short sentence.", inp("description", { area: true, max: 160, ph: "e.g. Cleans up tags, legends and overlaps in Revit views.", live: true })),
    h("div", { class: "row" }, field("Which versions? (optional)", inp("runsIn", { max: 80, ph: s.id === "Revit" ? "Revit 2021 and newer · pyRevit" : s.id === "AutoCAD" ? "AutoCAD 2024+ · AutoLISP" : "Rhino 8 · Grasshopper" })), field("Version number (optional)", inp("version", { max: 20, ph: "1.0" }))));

  // ---- step 2 (changes with software)
  let step2;
  if (s.id === "Revit") {
    const status = h("div");
    const loc = inp("location", { max: 300, mono: true, ph: "\\\\192.168.100.3\\BIM\\pyRevit\\MyTools.extension" });
    const check = async () => {
      status.replaceChildren(h("p", { class: "muted", text: "Reading the folder…" }));
      try {
        const r = await scanExtension(draft.location.trim(), draft.id);
        const keep = Object.fromEntries(draft.tools.map(t => [t.name, t]));
        draft.tools = r.tools.map((t, i) => ({ ...(keep[t.name] || {}), ...t, short: keep[t.name]?.short || t.short, id: keep[t.name]?.id || newId("t"), plugin: draft.id, order: i }));
        if (!draft.logo && draft.tools[0]?.icon) draft.logo = draft.tools[0].icon;
        status.replaceChildren(h("p", { class: "ok-box", text: `✓ Found it: ${r.tools.length} buttons in ${r.panels.length} panels. They're listed in step 3.` }));
        paintTools(); paintPreview();
      } catch (e) { status.replaceChildren(h("p", { class: "bad-box", text: e.message + " The server computer must be able to open this path." })); }
    };
    step2 = section(2, "How people install it", "This step changes with the software you picked.",
      h("div", { class: "row", style: "align-items:flex-end" }, field("Where is your .extension folder on the server?", loc, "Shift + right-click the folder › Copy as path. Keep it on the server, not your C: drive, so everyone gets the same version."),
        h("button", { class: "btn", type: "button", style: "flex:none", onclick: check }, "Check folder and read the buttons")), status);
  } else {
    const fileIn = h("input", { type: "file", hidden: true, accept: s.id === "AutoCAD" ? ".zip,.lsp,.fas,.vlx,.dcl,.mnl,.cuix" : s.id === "Rhino" ? ".zip,.gh,.ghx,.ghuser,.rhp" : "", onchange: async e => {
      const f = e.target.files[0]; if (!f) return; got.replaceChildren(h("p", { class: "muted", text: "Uploading " + f.name + "…" }));
      try { const r = await upload(f); draft.package = { path: r.path, name: r.name, size: r.size }; paintGot(); } catch (er) { got.replaceChildren(h("p", { class: "bad-box", text: er.message })); } } });
    const got = h("div"); const paintGot = () => got.replaceChildren(draft.package ? h("p", { class: "ok-box", text: "✓ " + draft.package.name + " is on the server. People will download it from the Install window." }) : "");
    paintGot();
    step2 = section(2, "How people install it", "This step changes with the software you picked.",
      h("div", { class: "drop" }, h("b", { text: s.id === "AutoCAD" ? "Upload your LISP package (.zip or .lsp)" : s.id === "Rhino" ? "Upload your .gh / .ghuser files (put several in one .zip)" : "Upload your files (optional)" }),
        h("small", { text: s.id === "Rhino" ? "Your scripts may only be on your own computer now. Uploading keeps a copy on the server for everyone. Find them in Grasshopper: File › Special Folders › User Object Folder." : "Up to 50 MB. We keep it on the server and people download it." }),
        h("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, "Choose file"), fileIn),
      got,
      s.id === "AutoCAD" ? field("Command people type to start it", inp("command", { max: 30, ph: "e.g. LK" }), "Shown in the install steps: “Type LK and press Enter”.") : null);
  }
  if (s.id !== "Revit") step2.append(field("Shared folder path (optional)", inp("location", { max: 300, mono: true, ph: "e.g. S:\\Resources\\Shared tools" }), "People can copy this path into File Explorer."));
  const notes = field("Anything else people should know when installing? (optional)", inp("installNotes", { area: true, max: 600, ph: "e.g. Run Configure-Claude.ps1 once before using the AI button." }));
  step2.append(notes);

  // ---- step 3 tools
  const toolsBox = h("div", { class: "stack", style: "gap:.6rem" });
  function paintTools() {
    toolsBox.replaceChildren(...draft.tools.map((t, i) => {
      const nm = h("input", { value: t.name || "", maxlength: "80", "aria-label": "Button name", oninput: e => (t.name = e.target.value) });
      const sh = h("input", { value: t.short || "", maxlength: "80", placeholder: "What it does, in a few words", "aria-label": "What it does", oninput: e => (t.short = e.target.value) });
      const more = h("details", { style: "grid-column:2/-1" }, h("summary", { class: "link", style: "font-size:.82rem" }, "More: longer description, how to use, panel"),
        h("div", { class: "stack", style: "gap:.6rem;margin-top:.6rem" },
          field("Ribbon panel", (() => { const x = h("input", { value: t.panel || "", oninput: e => (t.panel = e.target.value) }); return x; })()),
          field("Longer description", (() => { const x = h("textarea", { oninput: e => (t.description = e.target.value) }); x.value = t.description || ""; return x; })()),
          field("How to use (one step per line)", (() => { const x = h("textarea", { oninput: e => (t.howto = e.target.value) }); x.value = t.howto || ""; return x; })()),
          h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!t.beta, onchange: e => (t.beta = e.target.checked) }), "Still in beta")));
      return h("div", { class: "trow sw-" + draft.software.toLowerCase(), style: "background:var(--sw-tint)" },
        h("span", { class: "ti" }, img(t.icon, () => icon("bolt"))),
        h("div", { class: "nm" }, nm, h("small", { text: t.panel ? t.panel + " panel" : "" })), sh,
        h("button", { class: "btn small", type: "button", "aria-label": "Remove " + (t.name || "button"), onclick: () => { draft.tools.splice(i, 1); paintTools(); } }, "Remove"), more);
    }), h("button", { class: "link", type: "button", style: "align-self:flex-start;font-size:1rem", onclick: () => { draft.tools.push({ id: newId("t"), plugin: draft.id, name: "", short: "", order: draft.tools.length }); paintTools(); } }, "+ Add a button"));
  }
  paintTools();
  const step3 = section(3, "The buttons inside", "Say what each button does in a few plain words. That's what people read and search.", toolsBox);

  // ---- step 4
  const step4 = section(4, "Help people install it", null,
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: draft.helpOn !== false, onchange: e => (draft.helpOn = e.target.checked) }), "Let people ask me for help installing it"),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: draft.notify, onchange: e => (draft.notify = e.target.checked) }), editing ? "Post this change to What's New" : "Announce it in What's New"));

  // ---- preview + publish
  const preview = h("div");
  function paintPreview() { preview.replaceChildren(pluginCard({ ...draft, name: draft.name || "Your plugin" })); preview.querySelector("a")?.removeAttribute("href"); }
  paintPreview();
  const err = h("p", { class: "err" });
  const publish = async () => {
    if (!draft.name.trim()) { err.textContent = "Give your plugin a name (step 1)."; return; }
    if (!draft.madeBy.trim()) { err.textContent = "Add your name (step 1)."; return; }
    try { localStorage.setItem("sa.name", draft.madeBy.trim()); } catch (e) { /* ignore */ }
    const { tools, isNew, notify, ...plugin } = draft;
    const ops = [{ op: "upsert", coll: "plugins", item: plugin }];
    const keepIds = new Set(tools.filter(t => (t.name || "").trim()).map(t => t.id));
    for (const old of toolsOf(plugin.id)) if (!keepIds.has(old.id)) ops.push({ op: "delete", coll: "tools", id: old.id });
    tools.filter(t => (t.name || "").trim()).forEach((t, i) => ops.push({ op: "upsert", coll: "tools", item: { ...t, plugin: plugin.id, order: i } }));
    try {
      await batch(ops);
      if (notify) await postNews({ kind: isNew ? "NEW PLUGIN" : "UPDATE", plugin: plugin.id, title: isNew ? plugin.name + " added to Office Plugins" : plugin.name + " was updated", body: plugin.description || "", by: plugin.madeBy });
      draft = null; draftKey = null; toast(isNew ? "Published" : "Saved");
      location.hash = "#/plugin/" + encodeURIComponent(plugin.id);
    } catch (e) { err.textContent = e.message; }
  };
  const del = editing ? h("button", { class: "btn", type: "button", onclick: async e => {
    if (e.currentTarget.dataset.armed) { await remove("plugins", draft.id); draft = null; draftKey = null; toast("Plugin deleted"); location.hash = "#/plugins"; }
    else { e.currentTarget.dataset.armed = "1"; e.currentTarget.textContent = "Click again to delete"; } } }, "Delete plugin") : null;

  const side = h("aside", { class: "stack", style: "gap:1rem;position:sticky;top:5.5rem" },
    h("p", { class: "muted", style: "font-size:1.09rem", text: "How it will look" }), preview,
    h("div", { class: "row", style: "align-items:center" }, h("button", { class: "btn", type: "button", onclick: () => logoBtn.click() }, "Change icon"), h("span", { class: "muted", style: "font-size:.82rem", text: "PNG, any size" }), logoBtn),
    h("div", { class: "panel soft", style: "gap:.7rem" }, h("button", { class: "btn primary block", type: "button", onclick: publish }, editing ? "Save changes" : "Publish plugin"),
      h("a", { class: "btn block", href: editing ? "#/plugin/" + encodeURIComponent(draft.id) : "#/plugins" }, "Cancel"), err, del));
  root.replaceChildren(h("div", { class: "wrap page" }, h("div", { class: "cols" }, h("div", { class: "stack", style: "gap:1.45rem" }, step1, step2, step3, step4), side)));
}
