const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Speicherort für deine echten Online-Projekte
const SITES_DIR = path.join(__dirname, 'online_projekte');
const DB_FILE = path.join(__dirname, 'projekte.json');

if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Hilfsfunktionen für Datenbank
const loadProjects = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveProjects = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// 1. ECHTE AUSLIEFERUNG IM INTERNET UNTER /p/wunsch-link/
app.use('/p/:slug', (req, res, next) => {
  const slug = req.params.slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const projects = loadProjects();
  const project = projects.find(p => p.slug === slug && p.online === true);

  if (!project) {
    return res.status(404).send(`
      <body style="font-family:sans-serif;background:#0f172a;color:white;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center;">
        <div>
          <h1>404 – Nicht im Internet</h1>
          <p style="color:#94a3b8;">Dieses Projekt ist aktuell offline oder wurde entfernt.</p>
        </div>
      </body>
    `);
  }

  const projectFolder = path.join(SITES_DIR, project.id);
  express.static(projectFolder)(req, res, next);
});

// 2. API: Alle Projekte abrufen
app.get('/api/projects', (req, res) => {
  res.json(loadProjects());
});

// 3. API: Neues Projekt mit echten Dateien hochladen
app.post('/api/upload', upload.array('files'), (req, res) => {
  const id = 'proj_' + Date.now();
  const projectFolder = path.join(SITES_DIR, id);
  fs.mkdirSync(projectFolder, { recursive: true });

  const fileNames = [];
  (req.files || []).forEach(file => {
    const safeName = path.basename(file.originalname);
    fs.writeFileSync(path.join(projectFolder, safeName), file.buffer);
    fileNames.push(safeName);
  });

  const projects = loadProjects();
  const newProject = {
    id,
    name: req.body.name || 'Unbenanntes Projekt',
    slug: '',
    online: false,
    files: fileNames,
    createdAt: new Date().toISOString()
  };

  projects.unshift(newProject);
  saveProjects(projects);
  res.json(newProject);
});

// 4. API: Online stellen (fragt vorher Name & Wunsch-Link ab)
app.post('/api/publish/:id', (req, res) => {
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });

  const cleanSlug = (req.body.slug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-');

  if (!cleanSlug) return res.status(400).json({ error: 'Ungültiger Link' });

  const taken = projects.some(p => p.slug === cleanSlug && p.id !== req.params.id && p.online);
  if (taken) return res.status(409).json({ error: 'Dieser Link ist bereits vergeben!' });

  projects[idx].name = req.body.name || projects[idx].name;
  projects[idx].slug = cleanSlug;
  projects[idx].online = true;

  saveProjects(projects);
  res.json(projects[idx]);
});

// 5. API: Im Internet entfernen (offline schalten)
app.post('/api/unpublish/:id', (req, res) => {
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });

  projects[idx].online = false;
  saveProjects(projects);
  res.json(projects[idx]);
});

// 6. API: Komplett löschen
app.delete('/api/projects/:id', (req, res) => {
  let projects = loadProjects();
  projects = projects.filter(p => p.id !== req.params.id);
  saveProjects(projects);

  const projectFolder = path.join(SITES_DIR, req.params.id);
  if (fs.existsSync(projectFolder)) fs.rmSync(projectFolder, { recursive: true, force: true });
  res.json({ ok: true });
});

// 7. Dein Verwaltungs-Dashboard (Startseite)
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mein Echtes Web-Hosting Portal</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-6">
  <div class="max-w-4xl mx-auto">
    <header class="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-6 mb-8">
      <div>
        <h1 class="text-2xl font-bold text-indigo-400">Mein Web-Hoster</h1>
        <p class="text-sm text-slate-400">Lade deine HTML-, CSS- & JS-Dateien hoch und schalte sie live ins Internet.</p>
      </div>
      <button onclick="document.getElementById('uploadModal').classList.remove('hidden')" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-medium">
        + Projekt hochladen
      </button>
    </header>

    <div id="list" class="grid gap-4"></div>
  </div>

  <!-- Upload Modal -->
  <div id="uploadModal" class="hidden fixed inset-0 bg-black/75 flex items-center justify-center p-4">
    <form onsubmit="uploadProject(event)" class="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
      <h2 class="text-lg font-bold">Neues Projekt hochladen</h2>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Projektname (Entwurf)</label>
        <input id="projName" required placeholder="Mein Spiel" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Projektdateien (index.html, style.css, script.js...)</label>
        <input id="projFiles" type="file" multiple required class="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white" />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="document.getElementById('uploadModal').classList.add('hidden')" class="px-4 py-2 text-slate-400">Abbrechen</button>
        <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl font-medium">Speichern</button>
      </div>
    </form>
  </div>

  <!-- Vor-Veröffentlichungs-Dialog (Name & Link abfragen) -->
  <div id="publishModal" class="hidden fixed inset-0 bg-black/75 flex items-center justify-center p-4">
    <form onsubmit="confirmPublish(event)" class="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
      <h2 class="text-lg font-bold">Bevor es ins Internet geht...</h2>
      <input type="hidden" id="pubId" />
      <div>
        <label class="block text-sm text-slate-300 mb-1">Wie soll das Projekt heißen?</label>
        <input id="pubName" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Wie soll der Link aussehen?</label>
        <div class="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm">
          <span class="text-slate-500 mr-1" id="originPreview"></span>
          <input id="pubSlug" required placeholder="mein-projekt" class="bg-transparent flex-1 outline-none text-emerald-400 font-mono" />
        </div>
      </div>
      <p id="pubError" class="text-red-400 text-sm hidden"></p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="document.getElementById('publishModal').classList.add('hidden')" class="px-4 py-2 text-slate-400">Abbrechen</button>
        <button type="submit" class="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-medium">Jetzt online stellen</button>
      </div>
    </form>
  </div>

  <script>
    document.getElementById('originPreview').textContent = window.location.origin + '/p/';

    async function load() {
      const res = await fetch('/api/projects');
      const projects = await res.json();
      const list = document.getElementById('list');
      if (!projects.length) {
        list.innerHTML = '<p class="text-slate-500 text-center py-12">Noch keine Projekte hochgeladen.</p>';
        return;
      }
      list.innerHTML = projects.map(p => {
        const liveUrl = window.location.origin + '/p/' + p.slug + '/';
        return \`
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap justify-between items-center gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-lg">\${p.name}</h3>
                <span class="text-xs px-2.5 py-0.5 rounded-full \${p.online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}">
                  \${p.online ? '● Online im Internet' : '○ Offline'}
                </span>
              </div>
              <p class="text-xs text-slate-400 mt-1">Dateien: \${p.files.join(', ') || 'Keine'}</p>
              \${p.online ? \`<a href="\${liveUrl}" target="_blank" class="text-sm text-indigo-400 underline mt-2 inline-block">\${liveUrl}</a>\` : ''}
            </div>
            <div class="flex gap-2">
              \${p.online
                ? \`<button onclick="unpublish('\${p.id}')" class="bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 px-3 py-2 rounded-xl text-sm">Im Internet entfernen</button>\`
                : \`<button onclick="openPublish('\${p.id}', '\${p.name}', '\${p.slug}')" class="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl text-sm font-medium">Online stellen</button>\`
              }
              <button onclick="del('\${p.id}')" class="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-2 rounded-xl text-sm">Löschen</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function uploadProject(e) {
      e.preventDefault();
      const fd = new FormData();
      fd.append('name', document.getElementById('projName').value);
      for (const f of document.getElementById('projFiles').files) fd.append('files', f);
      await fetch('/api/upload', { method: 'POST', body: fd });
      document.getElementById('uploadModal').classList.add('hidden');
      e.target.reset();
      load();
    }

    function openPublish(id, name, slug) {
      document.getElementById('pubId').value = id;
      document.getElementById('pubName').value = name;
      document.getElementById('pubSlug').value = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      document.getElementById('pubError').classList.add('hidden');
      document.getElementById('publishModal').classList.remove('hidden');
    }

    async function confirmPublish(e) {
      e.preventDefault();
      const id = document.getElementById('pubId').value;
      const res = await fetch('/api/publish/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('pubName').value,
          slug: document.getElementById('pubSlug').value
        })
      });
      if (!res.ok) {
        const err = await res.json();
        const el = document.getElementById('pubError');
        el.textContent = err.error;
        el.classList.remove('hidden');
        return;
      }
      document.getElementById('publishModal').classList.add('hidden');
      load();
    }

    async function unpublish(id) {
      await fetch('/api/unpublish/' + id, { method: 'POST' });
      load();
    }

    async function del(id) {
      if (!confirm('Projekt wirklich komplett löschen?')) return;
      await fetch('/api/projects/' + id, { method: 'DELETE' });
      load();
    }

    load();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('Hosting-Portal läuft auf Port ' + PORT));