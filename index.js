const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'stremio-secret-key';
const MOVIES_FILE = path.join(__dirname, 'movies.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadMovies() {
  try {
    return JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveMovies(data) {
  fs.writeFileSync(MOVIES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Manifest ────────────────────────────────────────────────────────────────
const manifest = {
  id: 'com.personal.ftp.movies',
  version: '2.0.0',
  name: 'My FTP Movies',
  description: 'Personal FTP movie & series collection',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie',  id: 'ftp_movies',  name: 'My Movies',  extra: [{ name: 'search', isRequired: false }] },
    { type: 'series', id: 'ftp_series',  name: 'My Series',  extra: [{ name: 'search', isRequired: false }] }
  ],
  idPrefixes: ['tt'],
  behaviorHints: { adult: false, configurable: false }
};

app.get('/manifest.json', (req, res) => res.json(manifest));

// ─── Catalog ─────────────────────────────────────────────────────────────────
app.get('/catalog/:type/:id.json', (req, res) => {
  const { type } = req.params;
  const movies = loadMovies().filter(m => m.type === type);
  res.json({ metas: movies.map(m => ({ id: m.id, type: m.type, name: m.id })) });
});

app.get('/catalog/:type/:id/search=:query.json', (req, res) => {
  const { type, query } = req.params;
  const q = decodeURIComponent(query).toLowerCase();
  const movies = loadMovies().filter(m => m.type === type && m.id.toLowerCase().includes(q));
  res.json({ metas: movies.map(m => ({ id: m.id, type: m.type, name: m.id })) });
});

// ─── Meta ─────────────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  const item = loadMovies().find(m => m.id === id && m.type === type);
  if (!item) return res.json({ meta: null });
  res.json({ meta: { id: item.id, type: item.type, name: item.id } });
});

// ─── Stream ───────────────────────────────────────────────────────────────────
app.get('/stream/movie/:id.json', (req, res) => {
  const item = loadMovies().find(m => m.id === req.params.id && m.type === 'movie');
  if (!item) return res.json({ streams: [] });

  const streams = [];
  if (item.streamUrl1080p) streams.push({ url: item.streamUrl1080p, name: 'FTP', title: '1080p' });
  if (item.streamUrl720p)  streams.push({ url: item.streamUrl720p,  name: 'FTP', title: '720p'  });
  if (item.streamUrl)      streams.push({ url: item.streamUrl,      name: 'FTP', title: 'Default' });
  res.json({ streams });
});

app.get('/stream/series/:id/:season/:episode.json', (req, res) => {
  const { id, season, episode } = req.params;
  const item = loadMovies().find(m => m.id === id && m.type === 'series');
  if (!item || !item.episodes) return res.json({ streams: [] });

  const ep = item.episodes.find(e =>
    e.season === parseInt(season) && e.episode === parseInt(episode)
  );
  if (!ep) return res.json({ streams: [] });
  res.json({ streams: [{ url: ep.streamUrl, name: 'FTP', title: `S${season}E${episode}` }] });
});

// ─── Auth API ─────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

// ─── Movies API ───────────────────────────────────────────────────────────────
app.get('/api/movies', requireAuth, (req, res) => {
  res.json(loadMovies());
});

app.post('/api/movies', requireAuth, (req, res) => {
  const movies = loadMovies();
  const item = req.body;

  if (!item.id || !item.type) return res.status(400).json({ error: 'id and type required' });

  // For series: merge episodes if same ID exists
  if (item.type === 'series') {
    const existing = movies.find(m => m.id === item.id && m.type === 'series');
    if (existing) {
      // Add new episodes, avoid duplicates
      item.episodes.forEach(newEp => {
        const dup = existing.episodes.find(e => e.season === newEp.season && e.episode === newEp.episode);
        if (dup) { dup.streamUrl = newEp.streamUrl; }
        else { existing.episodes.push(newEp); }
      });
      existing.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
      saveMovies(movies);
      return res.json({ ok: true, data: movies });
    }
  }

  // Remove duplicate movie id then add
  const filtered = movies.filter(m => !(m.id === item.id && m.type === item.type));
  filtered.push(item);
  saveMovies(filtered);
  res.json({ ok: true, data: filtered });
});

app.delete('/api/movies/:id', requireAuth, (req, res) => {
  const movies = loadMovies().filter(m => m.id !== req.params.id);
  saveMovies(movies);
  res.json({ ok: true, data: movies });
});

app.delete('/api/movies/:id/episodes/:season/:episode', requireAuth, (req, res) => {
  const { id, season, episode } = req.params;
  const movies = loadMovies();
  const item = movies.find(m => m.id === id && m.type === 'series');
  if (item) {
    item.episodes = item.episodes.filter(
      e => !(e.season === parseInt(season) && e.episode === parseInt(episode))
    );
  }
  saveMovies(movies);
  res.json({ ok: true, data: movies });
});

// ─── Admin UI ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;
  const installUrl = `stremio://${host}/manifest.json`;

  res.send(`<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My FTP Movies — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d0d14;color:#e2e2e8;min-height:100vh}
.topbar{background:#13131e;border-bottom:1px solid #232336;padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;height:56px}
.logo{font-size:1rem;font-weight:600;color:#fff;display:flex;align-items:center;gap:8px}
.logo span{color:#8b6fc7}
.topbar-actions{display:flex;gap:8px;align-items:center}
.btn{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid #2e2e44;background:transparent;color:#b0b0cc;transition:all .15s}
.btn:hover{background:#1e1e2e;color:#fff}
.btn-primary{background:#7b5ea7;border-color:#7b5ea7;color:#fff}
.btn-primary:hover{background:#9070c0}
.btn-danger{color:#e06060;border-color:#3a2020}
.btn-danger:hover{background:#2a1515}
.btn-sm{padding:4px 10px;font-size:12px}
.container{max-width:900px;margin:0 auto;padding:2rem 1.5rem}
.install-bar{background:#13131e;border:1px solid #232336;border-radius:12px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem;gap:1rem;flex-wrap:wrap}
.install-url{font-family:monospace;font-size:12px;color:#7878a0;word-break:break-all}
.tabs{display:flex;gap:6px;margin-bottom:1.5rem}
.tab{padding:8px 20px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;border:1px solid #2e2e44;background:transparent;color:#7878a0;transition:all .15s}
.tab.active{background:#1e1833;border-color:#7b5ea7;color:#c4a0f0}
.card{background:#13131e;border:1px solid #232336;border-radius:12px;padding:1.25rem;margin-bottom:1rem}
.card h3{font-size:14px;font-weight:500;color:#a0a0c0;margin-bottom:1rem}
.form-row{display:grid;gap:10px;margin-bottom:10px}
.form-row.two{grid-template-columns:1fr 1fr}
.form-row.three{grid-template-columns:80px 80px 1fr}
label{font-size:12px;color:#6868a0;display:block;margin-bottom:4px}
input{width:100%;background:#0d0d14;border:1px solid #2e2e44;border-radius:7px;padding:8px 11px;font-size:13px;color:#e2e2e8;outline:none;transition:border .15s}
input:focus{border-color:#7b5ea7}
input::placeholder{color:#3e3e60}
.item{background:#0d0d14;border:1px solid #1e1e30;border-radius:9px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.item-info{display:flex;flex-direction:column;gap:2px}
.item-id{font-size:13px;font-weight:500;color:#e2e2e8}
.item-meta{font-size:11px;color:#5050a0}
.badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:500}
.badge-movie{background:#1e1535;color:#a07ad0}
.badge-series{background:#0e2035;color:#5090d0}
.ep-list{margin-top:8px;padding-top:8px;border-top:1px solid #1e1e30}
.ep-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px;color:#6868a0}
.ep-url{font-family:monospace;font-size:11px;color:#4a4a80;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px}
.empty{text-align:center;color:#3e3e60;font-size:13px;padding:2rem}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;background:#1e2e1e;border:1px solid #2e5e2e;color:#80d080;border-radius:9px;padding:10px 18px;font-size:13px;transform:translateY(80px);opacity:0;transition:all .3s;z-index:999}
.toast.show{transform:translateY(0);opacity:1}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:100}
.login-box{background:#13131e;border:1px solid #232336;border-radius:16px;padding:2rem;width:320px;text-align:center}
.login-box h2{font-size:1.1rem;margin-bottom:1.5rem;color:#fff}
.login-box input{margin-bottom:1rem}
.login-box .btn-primary{width:100%;padding:10px}
</style>
</head>
<body>

<div id="login-overlay" class="overlay">
  <div class="login-box">
    <div style="font-size:2rem;margin-bottom:.5rem">🎬</div>
    <h2>Admin Login</h2>
    <input id="pwd-input" type="password" placeholder="Password দিন" onkeydown="if(event.key==='Enter')doLogin()">
    <button class="btn btn-primary" onclick="doLogin()">Login</button>
    <p id="login-err" style="color:#e06060;font-size:12px;margin-top:.75rem;display:none">ভুল password!</p>
  </div>
</div>

<div id="app" style="display:none">
  <div class="topbar">
    <div class="logo"><span>🎬</span> My FTP Movies</div>
    <div class="topbar-actions">
      <a href="${installUrl}" class="btn btn-sm">⚡ Stremio Install</a>
      <button class="btn btn-sm btn-danger" onclick="doLogout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div class="install-bar">
      <div>
        <div style="font-size:12px;color:#5050a0;margin-bottom:4px">Manifest URL</div>
        <div class="install-url">${baseUrl}/manifest.json</div>
      </div>
      <button class="btn btn-sm" onclick="copyUrl('${baseUrl}/manifest.json', this)">Copy</button>
    </div>

    <div class="tabs">
      <button class="tab active" id="tab-movie" onclick="switchTab('movie')">🎬 মুভি</button>
      <button class="tab" id="tab-series" onclick="switchTab('series')">📺 সিরিজ</button>
    </div>

    <!-- Movie Panel -->
    <div id="panel-movie">
      <div class="card">
        <h3>নতুন মুভি যোগ করুন</h3>
        <div class="form-row">
          <div>
            <label>IMDB লিঙ্ক বা ID</label>
            <input id="m-imdb" placeholder="https://www.imdb.com/title/tt0816692/ অথবা tt0816692">
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Stream URL (Default)</label>
            <input id="m-url" placeholder="http://your-ftp.com/movies/film.mkv">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>1080p URL (ঐচ্ছিক)</label>
            <input id="m-1080" placeholder="http://...1080p.mkv">
          </div>
          <div>
            <label>720p URL (ঐচ্ছিক)</label>
            <input id="m-720" placeholder="http://...720p.mkv">
          </div>
        </div>
        <button class="btn btn-primary" onclick="addMovie()" style="width:100%;padding:9px;margin-top:4px">+ মুভি যোগ করুন</button>
      </div>
      <div id="movie-list"></div>
    </div>

    <!-- Series Panel -->
    <div id="panel-series" style="display:none">
      <div class="card">
        <h3>এপিসোড যোগ করুন</h3>
        <div class="form-row">
          <div>
            <label>IMDB লিঙ্ক বা ID (সিরিজের)</label>
            <input id="s-imdb" placeholder="https://www.imdb.com/title/tt0944947/ অথবা tt0944947">
          </div>
        </div>
        <div class="form-row three">
          <div>
            <label>Season</label>
            <input id="s-season" type="number" min="1" value="1">
          </div>
          <div>
            <label>Episode</label>
            <input id="s-ep" type="number" min="1" value="1">
          </div>
          <div>
            <label>Stream URL</label>
            <input id="s-url" placeholder="http://your-ftp.com/series/s01e01.mkv">
          </div>
        </div>
        <button class="btn btn-primary" onclick="addEpisode()" style="width:100%;padding:9px;margin-top:4px">+ এপিসোড যোগ করুন</button>
      </div>
      <div id="series-list"></div>
    </div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
let allData = [];

async function init() {
  const r = await fetch('/api/me');
  const me = await r.json();
  if (me.loggedIn) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    await loadData();
  }
}

async function doLogin() {
  const pwd = document.getElementById('pwd-input').value;
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ password: pwd })
  });
  if (r.ok) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    await loadData();
  } else {
    document.getElementById('login-err').style.display = 'block';
  }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

async function loadData() {
  const r = await fetch('/api/movies');
  allData = await r.json();
  renderLists();
}

function extractId(val) {
  const m = val.match(/tt\\d+/);
  return m ? m[0] : val.trim();
}

async function addMovie() {
  const id = extractId(document.getElementById('m-imdb').value);
  const url = document.getElementById('m-url').value.trim();
  const u1080 = document.getElementById('m-1080').value.trim();
  const u720 = document.getElementById('m-720').value.trim();
  if (!id || !url) return showToast('IMDB ID ও URL দিন', 'err');

  const item = { id, type: 'movie', streamUrl: url };
  if (u1080) item.streamUrl1080p = u1080;
  if (u720) item.streamUrl720p = u720;

  const r = await fetch('/api/movies', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(item)
  });
  const d = await r.json();
  allData = d.data;
  renderLists();
  document.getElementById('m-imdb').value = '';
  document.getElementById('m-url').value = '';
  document.getElementById('m-1080').value = '';
  document.getElementById('m-720').value = '';
  showToast('মুভি যোগ হয়েছে!');
}

async function addEpisode() {
  const id = extractId(document.getElementById('s-imdb').value);
  const season = parseInt(document.getElementById('s-season').value);
  const ep = parseInt(document.getElementById('s-ep').value);
  const url = document.getElementById('s-url').value.trim();
  if (!id || !url) return showToast('IMDB ID ও URL দিন', 'err');

  const item = { id, type: 'series', episodes: [{ season, episode: ep, streamUrl: url }] };

  const r = await fetch('/api/movies', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(item)
  });
  const d = await r.json();
  allData = d.data;
  renderLists();
  document.getElementById('s-url').value = '';
  document.getElementById('s-ep').value = ep + 1;
  showToast('এপিসোড যোগ হয়েছে!');
}

async function deleteItem(id) {
  if (!confirm(id + ' মুছে ফেলবেন?')) return;
  const r = await fetch('/api/movies/' + id, { method: 'DELETE' });
  const d = await r.json();
  allData = d.data;
  renderLists();
  showToast('মুছে ফেলা হয়েছে');
}

async function deleteEpisode(id, season, episode) {
  const r = await fetch('/api/movies/' + id + '/episodes/' + season + '/' + episode, { method: 'DELETE' });
  const d = await r.json();
  allData = d.data;
  renderLists();
  showToast('এপিসোড মুছে ফেলা হয়েছে');
}

function renderLists() {
  const movies = allData.filter(m => m.type === 'movie');
  const series = allData.filter(m => m.type === 'series');

  const mEl = document.getElementById('movie-list');
  if (movies.length === 0) {
    mEl.innerHTML = '<div class="empty">কোনো মুভি নেই — উপরে যোগ করুন</div>';
  } else {
    mEl.innerHTML = movies.map(m => \`
      <div class="item">
        <div class="item-info">
          <div class="item-id"><span class="badge badge-movie">Movie</span> \${m.id}</div>
          <div class="item-meta">\${m.streamUrl1080p ? '1080p · ' : ''}\${m.streamUrl720p ? '720p · ' : ''}Default</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteItem('\${m.id}')">মুছুন</button>
      </div>
    \`).join('');
  }

  const sEl = document.getElementById('series-list');
  if (series.length === 0) {
    sEl.innerHTML = '<div class="empty">কোনো সিরিজ নেই — উপরে যোগ করুন</div>';
  } else {
    sEl.innerHTML = series.map(s => \`
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div><span class="badge badge-series">Series</span> <span style="font-size:14px;font-weight:500;margin-left:6px">\${s.id}</span></div>
          <button class="btn btn-sm btn-danger" onclick="deleteItem('\${s.id}')">সব মুছুন</button>
        </div>
        <div class="ep-list">
          \${(s.episodes || []).map(e => \`
            <div class="ep-row">
              <span>S\${String(e.season).padStart(2,'0')}E\${String(e.episode).padStart(2,'0')}</span>
              <span class="ep-url">\${e.streamUrl}</span>
              <button class="btn btn-sm btn-danger" onclick="deleteEpisode('\${s.id}',\${e.season},\${e.episode})">×</button>
            </div>
          \`).join('')}
        </div>
      </div>
    \`).join('');
  }
}

function switchTab(tab) {
  document.getElementById('panel-movie').style.display = tab === 'movie' ? 'block' : 'none';
  document.getElementById('panel-series').style.display = tab === 'series' ? 'block' : 'none';
  document.getElementById('tab-movie').className = 'tab' + (tab === 'movie' ? ' active' : '');
  document.getElementById('tab-series').className = 'tab' + (tab === 'series' ? ' active' : '');
}

function copyUrl(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'err' ? '#2e1e1e' : '#1e2e1e';
  t.style.borderColor = type === 'err' ? '#6e2e2e' : '#2e5e2e';
  t.style.color = type === 'err' ? '#e08080' : '#80d080';
  t.className = 'toast show';
  setTimeout(() => t.className = 'toast', 2500);
}

init();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
