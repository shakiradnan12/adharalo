const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Stremio@2025!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'xK9mP2vL7qR4nW8z';

// JSONBin config - persistent storage
const JSONBIN_ID = process.env.JSONBIN_ID || '';
const JSONBIN_KEY = process.env.JSONBIN_KEY || '';
const USE_JSONBIN = JSONBIN_ID && JSONBIN_KEY;

const MOVIES_FILE = path.join(__dirname, 'movies.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Storage: JSONBin (persistent) or local file ───────────────────────────────
async function loadMovies() {
  if (USE_JSONBIN) {
    try {
      const fetch = require('node-fetch');
      const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
      });
      const d = await r.json();
      return d.record || [];
    } catch(e) {
      console.error('JSONBin load error:', e.message);
      return [];
    }
  }
  try { return JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf8')); }
  catch { return []; }
}

async function saveMovies(data) {
  if (USE_JSONBIN) {
    try {
      const fetch = require('node-fetch');
      await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
        body: JSON.stringify(data)
      });
    } catch(e) {
      console.error('JSONBin save error:', e.message);
    }
  } else {
    fs.writeFileSync(MOVIES_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Manifest ──────────────────────────────────────────────────────────────────
const manifest = {
  id: 'com.personal.ftp.movies',
  version: '2.0.0',
  name: 'My FTP Movies',
  description: 'Personal FTP movie & series collection',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie',  id: 'ftp_movies', name: 'My Movies',  extra: [{ name: 'search', isRequired: false }] },
    { type: 'series', id: 'ftp_series', name: 'My Series',  extra: [{ name: 'search', isRequired: false }] }
  ],
  idPrefixes: ['tt'],
  behaviorHints: { adult: false, configurable: false }
};

app.get('/manifest.json', (req, res) => res.json(manifest));

// ── Catalog ───────────────────────────────────────────────────────────────────
app.get('/catalog/:type/:id.json', async (req, res) => {
  const movies = await loadMovies();
  const metas = movies
    .filter(m => m.type === req.params.type)
    .map(m => ({ id: m.id, type: m.type, name: m.id }));
  res.json({ metas });
});

app.get('/catalog/:type/:id/search=:query.json', async (req, res) => {
  const movies = await loadMovies();
  const q = decodeURIComponent(req.params.query).toLowerCase();
  const metas = movies
    .filter(m => m.type === req.params.type && m.id.toLowerCase().includes(q))
    .map(m => ({ id: m.id, type: m.type, name: m.id }));
  res.json({ metas });
});

// ── Meta ──────────────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', async (req, res) => {
  const movies = await loadMovies();
  const item = movies.find(m => m.id === req.params.id && m.type === req.params.type);
  res.json({ meta: item ? { id: item.id, type: item.type, name: item.id } : null });
});

// ── Stream ────────────────────────────────────────────────────────────────────
app.get('/stream/movie/:id.json', async (req, res) => {
  const movies = await loadMovies();
  const item = movies.find(m => m.id === req.params.id && m.type === 'movie');
  if (!item) return res.json({ streams: [] });
  const streams = [];
  if (item.streamUrl1080p) streams.push({ url: item.streamUrl1080p, name: 'FTP', title: '1080p' });
  if (item.streamUrl720p)  streams.push({ url: item.streamUrl720p,  name: 'FTP', title: '720p'  });
  if (item.streamUrl)      streams.push({ url: item.streamUrl,      name: 'FTP', title: 'Default' });
  res.json({ streams });
});

app.get('/stream/series/:id/:season/:episode.json', async (req, res) => {
  const { id, season, episode } = req.params;
  const movies = await loadMovies();
  const item = movies.find(m => m.id === id && m.type === 'series');
  if (!item) return res.json({ streams: [] });
  const ep = (item.episodes || []).find(e =>
    e.season === parseInt(season) && e.episode === parseInt(episode)
  );
  if (!ep) return res.json({ streams: [] });
  res.json({ streams: [{ url: ep.streamUrl, name: 'FTP', title: `S${season}E${episode}` }] });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ loggedIn: !!(req.session && req.session.loggedIn) }));

// ── Movies API ────────────────────────────────────────────────────────────────
app.get('/api/movies', requireAuth, async (req, res) => res.json(await loadMovies()));

app.post('/api/movies', requireAuth, async (req, res) => {
  const movies = await loadMovies();
  const item = req.body;
  if (!item.id || !item.type) return res.status(400).json({ error: 'id and type required' });

  if (item.type === 'series') {
    const existing = movies.find(m => m.id === item.id && m.type === 'series');
    if (existing) {
      item.episodes.forEach(newEp => {
        const dup = existing.episodes.find(e => e.season === newEp.season && e.episode === newEp.episode);
        if (dup) dup.streamUrl = newEp.streamUrl;
        else existing.episodes.push(newEp);
      });
      existing.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
      await saveMovies(movies);
      return res.json({ ok: true, data: movies });
    }
  }

  const filtered = movies.filter(m => !(m.id === item.id && m.type === item.type));
  filtered.push(item);
  await saveMovies(filtered);
  res.json({ ok: true, data: filtered });
});

app.delete('/api/movies/:id', requireAuth, async (req, res) => {
  const movies = (await loadMovies()).filter(m => m.id !== req.params.id);
  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

app.delete('/api/movies/:id/episodes/:season/:episode', requireAuth, async (req, res) => {
  const { id, season, episode } = req.params;
  const movies = await loadMovies();
  const item = movies.find(m => m.id === id && m.type === 'series');
  if (item) item.episodes = item.episodes.filter(
    e => !(e.season === parseInt(season) && e.episode === parseInt(episode))
  );
  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

// ── Admin UI (serve from file) ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => console.log(`✅ Running on port ${PORT} | JSONBin: ${USE_JSONBIN ? 'ON' : 'OFF (local file)'}`));
