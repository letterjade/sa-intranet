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

## 5. Wishlist and alerts

**Where a request goes.** When someone posts on the Wishlist it is saved in `data.json` on the server. It shows on the Wishlist page, in the Home page's "What's new › Requests", and as a "New request" post in What's New. Anyone can vote, attach files and change its status. When the status moves to Planned, In progress or Done, that is posted to What's New too. Nobody is emailed.

**Alerts.** Each person turns alerts on in **What's New › Alerts** and picks what they want (new tools, updates, wishlist, help requests, office news). Settings are saved in that person's browser. SA Intranet checks for new posts every 20 seconds.

* Out of the box (plain `http://` address) alerts appear in the corner of SA Intranet while it is open in a browser tab.
* To get real **Windows pop-ups**, even when the tab is in the background, the browser has to treat the address as secure. Either:
  * **Per PC (quick test):** in Edge go to `edge://flags/#unsafely-treat-insecure-origin-as-secure` (Chrome: `chrome://flags/...`), add `http://<site address>:8080`, Enable, restart the browser. Then turn alerts on again.
  * **Every PC (proper):** the Edge/Chrome group policy *OverrideSecurityRestrictionsOnInsecureOrigin* with the site address, or put the site on an internal `https://` address.

No code changes are needed for either.

## 6. Admin page (only you)

Open **Admin** at the very bottom of any page (or go to `…:8080/#/admin`). The first time, it asks you to choose a PIN. After that, only someone with the PIN can open it. On your computer an **Admin** tab appears in the top bar, with a red number when someone is waiting for help or has posted a new request.

* **Help requests:** everyone who clicked "Ask for help", where they sit, and a **Done** button.
* **Wishlist:** every request, its status, votes and files. Remove the ones you don't need.
* **Everything that changed:** every add, edit, delete and upload, with the time, the name they typed and which computer it came from. **Details** shows exactly what changed. **Undo** puts it back.
* **Uploaded files:** what's in `uploads\`, how big it is, what it's attached to, and free space on the drive. Delete files here.
* **Backups:** restore a day's copy of everything. Today's version is saved first.

Where it's kept, next to the site (none of it goes to GitHub):

* `changes.jsonl`: the list of changes, one per line. It grows slowly; delete it to start fresh.
* `admin.json`: your PIN (scrambled, never stored as-is). **Forgot the PIN?** Delete `admin.json` and choose a new one.

The PIN keeps the Admin page private, but anyone on the network can still add and edit things on the normal pages. That's on purpose, and the change list means nothing is lost without a trace.

## Files

```
index.html               page shell
assets/css/styles.css    all styling (Jost font, brand colours)
assets/js/               the app (one file per page in pages/)
assets/fonts/            Jost (open font licence)
icons/                   tool icons read from pyRevit folders
server.py                the web server (Python standard library only)
assets/js/pages/admin.js the Admin page
data.seed.json           starting data
Start-SA-Intranet.bat    start the server on Windows
Update-from-GitHub.bat   get the latest code on the server
```

## Office catalogue update

The office catalogue includes JadeTools for AutoCAD, Snyder Detail Library and Jade’s Adobe templates. Categories appear in this order: Revit, AutoCAD, Adobe, Rhino / Grasshopper, Other. Shared folders are displayed with Copy path controls; paste paths into File Explorer.

After pulling this update, restart server.py. A one-time migration adds missing entries from office-catalog.json to the live data.json without replacing existing records or office edits. Fresh installations receive the same entries from data.seed.json. The Adobe contents reflect the supplied folder screenshot; compatibility and runtime behaviour of the uploaded plugins have not been independently tested in their host applications.
