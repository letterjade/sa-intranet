# SA Intranet

The Snyder Architects office start page: **Office Plugins** (Revit, Rhino / Grasshopper, AutoCAD tools made in the office), **Office Systems** (links to the apps on our server), a **Wishlist** for tool requests, and **What's New**.

It is a small website that runs on the office server. No logins, nothing to install except Python.

```
http://192.168.100.3:8080/          (or whichever computer runs it)
```

---

## 1. Run it on the office server

1. Install **Python 3** from python.org on the server (tick "Add python.exe to PATH").
2. Install **Git for Windows** (git-scm.com) on the server.
3. Get the code onto the server, for example into `D:\WebTools`:
   ```
   cd D:\WebTools
   git clone https://github.com/letterjade/sa-intranet.git
   ```
4. Double-click **`Start-SA-Intranet.bat`** in the `sa-intranet` folder. Keep that window open.
5. Everyone opens `http://<server-IP>:8080/`. If Windows asks about the firewall, allow **Private/Domain** networks only.

To start it automatically when the server restarts, ask IT to add `Start-SA-Intranet.bat` to **Task Scheduler** with the trigger *At startup*.

To make it everyone's browser start page: Edge or Chrome › Settings › On startup › *Open a specific page* › add the address. IT can push this to every PC with Group Policy.

> Anyone on the office network can add, edit and delete. Never expose port 8080 to the internet.

## 2. Edit it in VS Code

1. Install **VS Code** and **Git for Windows** on your own computer, and sign in to GitHub in VS Code (Accounts icon, bottom left).
2. In VS Code: **Source Control › Clone Repository** › paste `https://github.com/letterjade/sa-intranet.git` › pick a folder.
3. Try your changes on your own computer: open a terminal in VS Code (**Terminal › New Terminal**) and run
   ```
   python server.py
   ```
   then open `http://localhost:8080/`. (This uses a copy of the data, so you can't break the real one.)
4. When you're happy: **Source Control** › type a short message › **Commit** › **Sync Changes** (this pushes to GitHub).
5. On the server, double-click **`Update-from-GitHub.bat`**, then close and re-open the `Start-SA-Intranet.bat` window.

### Where things are

| You want to change… | Edit this file |
|---|---|
| Colours, fonts, spacing | `assets/css/styles.css` (colours are at the top, under `:root`) |
| Home page | `assets/js/pages/home.js` |
| Office Plugins list | `assets/js/pages/plugins.js` |
| A plugin's page and the **Install** window (the Revit / AutoCAD / Grasshopper steps) | `assets/js/pages/plugin.js` |
| "Add your plugin" form | `assets/js/pages/editor.js` |
| Office Systems page, "Add a shortcut" window, plugin cards | `assets/js/pages/systems.js`, `assets/js/pages/common.js` |
| Wishlist | `assets/js/pages/wishlist.js` |
| What's New and alerts | `assets/js/pages/news.js`, `assets/js/notify.js` |
| Top bar tabs, buttons, icons | `assets/js/ui.js` |
| Footer address | `index.html` |
| Saving, uploads, reading pyRevit folders | `server.py` |
| Starting data for a brand-new install | `data.seed.json` |

## 3. Where the office's data lives

* **`data.json`** on the server holds every link, plugin, tool, request and news post. It is created from `data.seed.json` the first time the server runs. It is **not** in GitHub (see `.gitignore`), so pushing code never overwrites what people have entered.
* **`uploads\`** holds files people upload (LISP packages, Grasshopper scripts, icons, attachments).
* **`backups\`** gets one copy of `data.json` per day automatically. To restore, stop the server, copy a backup over `data.json`, start it again.
* **Personal shortcuts** ("Just me") and **alert settings** are saved in each person's browser.

## 4. Adding plugins

Click **Office Plugins › + Add your plugin**.

* **Revit (pyRevit):** put the `.extension` folder on the server, paste its path, click **Check folder and read the buttons**. The server reads every button's name, panel, tooltip and `icon.png`. The server computer must be able to open that path.
* **AutoCAD (LISP):** upload the `.zip` or `.lsp`, and type the command people use to start it.
* **Rhino / Grasshopper:** upload your `.gh` / `.ghuser` files (several in one `.zip`). This keeps a copy on the server instead of only on your own computer.

**Jade Cleaner:** set its real server folder: open the plugin › **Edit** › step 2. Until then its Install window tells people to ask for help.

## 5. Desktop pop-up alerts

Alerts work straight away *inside* SA Intranet while it's open in a tab. Real Windows pop-ups need the site on an **https://** address: browsers don't allow website notifications on plain `http://192.168.x.x`. To turn them on, IT can put SA Intranet behind an internal HTTPS certificate (for example IIS or Caddy as a reverse proxy to port 8080, with the office's internal certificate trusted on every PC). Nothing in the code needs to change.

## Files

```
index.html               page shell
assets/css/styles.css    all styling (Jost font, brand colours)
assets/js/               the app (one file per page in pages/)
assets/fonts/            Jost (open font licence)
icons/                   tool icons read from pyRevit folders
server.py                the web server (Python standard library only)
data.seed.json           starting data
Start-SA-Intranet.bat    start the server on Windows
Update-from-GitHub.bat   get the latest code on the server
```
