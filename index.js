const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 7000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adnan123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'xK9mP2vL7qR4nW8z';
const OMDB_API_KEY = process.env.OMDB_API_KEY || 'deb30ab';

// GitHub config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'shakiradnan12/adharalo';
const GITHUB_FILE = 'movies.json';
const MOVIES_FILE = path.join(__dirname, 'movies.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Safe JSON Parsing Core
function safeParse(str) {
  try { return JSON.parse(str); }
  catch(e) { return []; }
}

// ── Storage: GitHub (persistent) ─────────────────────────────────────────────
async function loadMovies() {
  if (GITHUB_TOKEN) {
    try {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Stremio-Addon'
        }
      });
      if (r.ok) {
        const json = await r.json();
        const content = Buffer.from(json.content, 'base64').toString('utf8');
        return safeParse(content);
      }
    } catch (e) { console.error("Error loading from GitHub:", e); }
  }
  
  if (fs.existsSync(MOVIES_FILE)) {
    return safeParse(fs.readFileSync(MOVIES_FILE, 'utf8'));
  }
  return [];
}

async function saveMovies(movies) {
  const contentStr = JSON.stringify(movies, null, 2);
  fs.writeFileSync(MOVIES_FILE, contentStr, 'utf8');

  if (GITHUB_TOKEN) {
    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
      const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Stremio-Addon'
      };
      
      let sha = null;
      const getFile = await fetch(url, { headers });
      if (getFile.ok) {
        const fileJson = await getFile.json();
        sha = fileJson.sha;
      }

      await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: 'Update movies database via Admin Engine Cluster',
          content: Buffer.from(contentStr).toString('base64'),
          sha: sha
        })
      });
    } catch (e) { console.error("Error saving to GitHub:", e); }
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized Access Layer Failure' });
}

// ── Metadata cache (server-side, so Stremio catalog/meta show real titles+posters,
//    and the admin panel never has to expose the OMDb key to the browser) ──────
const metaCache = new Map(); // id -> { name, poster, year, rating, genre, runtime, plot, ts }
const META_CACHE_TTL = 12 * 60 * 60 * 1000; // 12h

async function fetchOmdb(id, force) {
  const cached = metaCache.get(id);
  if (!force && cached && (Date.now() - cached.ts) < META_CACHE_TTL) return cached;
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${id}&plot=short`);
    const data = await r.json();
    const meta = {
      name: data && data.Title ? data.Title : id,
      poster: data && data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
      year: data && data.Year ? data.Year : '',
      rating: data && data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : '',
      genre: data && data.Genre && data.Genre !== 'N/A' ? data.Genre : '',
      runtime: data && data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : '',
      plot: data && data.Plot && data.Plot !== 'N/A' ? data.Plot : '',
      ts: Date.now()
    };
    metaCache.set(id, meta);
    return meta;
  } catch (e) {
    return { name: id, poster: null, year: '', rating: '', genre: '', runtime: '', plot: '', ts: Date.now() };
  }
}
// Backwards-compatible alias used by catalog/meta routes below
const fetchTitleMeta = fetchOmdb;

// ── Logo upload storage (Branding) ───────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PUBLIC_DIR),
    filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.svg'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PNG, JPG or SVG images are allowed'), ok);
  }
});

function clearExistingLogos() {
  ['png', 'jpg', 'jpeg', 'svg'].forEach(ext => {
    const p = path.join(PUBLIC_DIR, `logo.${ext}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

// ── API ROUTES ──────────────────────────────────────────────────────────────

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid Security Key Module Token' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/movies', requireAuth, async (req, res) => {
  const data = await loadMovies();
  res.json(data);
});

// BUG FIX BLOCK: Dynamic Request Mutex Array Queue Map Protection
app.post('/api/movies', requireAuth, async (req, res) => {
  const item = req.body;
  if (!item || !item.id || !item.type) return res.status(400).json({ error: 'Missing core body signature: id and type required' });
  if (item.type !== 'movie' && item.type !== 'series') return res.status(400).json({ error: 'type must be movie or series' });

  // Load fresh dynamic state stack to bypass memory pointer lock
  const movies = await loadMovies();

  if (item.type === 'series') {
    let existing = movies.find(m => m.id === item.id && m.type === 'series');
    if (existing) {
      if (!existing.episodes) existing.episodes = [];
      
      (item.episodes || []).forEach(newEp => {
        let dup = existing.episodes.find(e => e.season === newEp.season && e.episode === newEp.episode);
        if (dup) {
          dup.streamUrl = newEp.streamUrl;
        } else {
          existing.episodes.push(newEp);
        }
      });
      
      existing.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
      await saveMovies(movies);
      return res.json({ ok: true, data: movies });
    }
  }

  // Pure data filter stack operation rebuild
  const filtered = movies.filter(m => !(m.id === item.id && m.type === item.type));
  filtered.push(item);
  
  await saveMovies(filtered);
  res.json({ ok: true, data: filtered });
});

// Edit an existing movie/series' top-level fields (stream links, etc.) without touching episodes array
app.put('/api/movies/:id', requireAuth, async (req, res) => {
  const movies = await loadMovies();
  const body = req.body || {};
  const item = movies.find(m => m.id === req.params.id && m.type === body.type);
  if (!item) return res.status(404).json({ error: 'Asset node not found' });

  if (body.streamUrl !== undefined) item.streamUrl = body.streamUrl;
  if (body.streamUrl1080p !== undefined) item.streamUrl1080p = body.streamUrl1080p;
  if (body.streamUrl720p !== undefined) item.streamUrl720p = body.streamUrl720p;

  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

// Edit a single episode's stream URL within a series
app.put('/api/movies/:id/episodes/:season/:episode', requireAuth, async (req, res) => {
  const { id, season, episode } = req.params;
  const movies = await loadMovies();
  const item = movies.find(m => m.id === id && m.type === 'series');
  if (!item) return res.status(404).json({ error: 'Series not found' });
  const ep = (item.episodes || []).find(e => e.season === parseInt(season) && e.episode === parseInt(episode));
  if (!ep) return res.status(404).json({ error: 'Episode not found' });
  if (req.body.streamUrl !== undefined) ep.streamUrl = req.body.streamUrl;
  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

// Admin-panel metadata proxy — keeps the OMDb key server-side, shared cache for all sessions
app.get('/api/admin-meta/:id', requireAuth, async (req, res) => {
  const force = req.query.fresh === '1';
  const meta = await fetchOmdb(req.params.id, force);
  res.json(meta);
});

// Branding: upload / remove the addon logo shown inside Stremio
app.post('/api/upload-logo', requireAuth, (req, res) => {
  clearExistingLogos();
  logoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ ok: true, url: `/public/${req.file.filename}` });
  });
});

app.delete('/api/upload-logo', requireAuth, (req, res) => {
  clearExistingLogos();
  res.json({ ok: true });
});

app.delete('/api/movies/:id', requireAuth, async (req, res) => {
  const baseMovies = await loadMovies();
  const movies = baseMovies.filter(m => m.id !== req.params.id);
  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

app.delete('/api/movies/:id/episodes/:season/:episode', requireAuth, async (req, res) => {
  const { id, season, episode } = req.params;
  const movies = await loadMovies();
  const item = movies.find(m => m.id === id && m.type === 'series');
  if (item && item.episodes) {
    item.episodes = item.episodes.filter(
      e => !(e.season === parseInt(season) && e.episode === parseInt(episode))
    );
  }
  await saveMovies(movies);
  res.json({ ok: true, data: movies });
});

// Stremio Manifest Endpoint Configuration Base
app.get('/manifest.json', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const manifest = {
    id: 'org.adharalo.ftpaddon',
    version: '2.5.0',
    name: 'AdharAlo Server Engine',
    description: 'Enterprise Premium Streaming Gateway for Personal Library Stream Nodes.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
      { type: 'movie', id: 'adharalo_movies', name: 'AdharAlo Movies', extra: [{ name: 'search', isRequired: false }] },
      { type: 'series', id: 'adharalo_series', name: 'AdharAlo Series', extra: [{ name: 'search', isRequired: false }] }
    ],
    idPrefixes: ['tt']
  };
  const logoExt = ['png', 'jpg', 'jpeg', 'svg'].find(ext => fs.existsSync(path.join(__dirname, 'public', `logo.${ext}`)));
  if (logoExt) manifest.logo = `${base}/public/logo.${logoExt}`;
  const bgExt = ['png', 'jpg', 'jpeg'].find(ext => fs.existsSync(path.join(__dirname, 'public', `background.${ext}`)));
  if (bgExt) manifest.background = `${base}/public/background.${bgExt}`;
  res.json(manifest);
});

// ── Catalog (so the addon shows its own row of Movies/Series in Stremio) ──────
app.get('/catalog/:type/:id.json', async (req, res) => {
  const movies = await loadMovies();
  const items = movies.filter(m => m.type === req.params.type);
  const metas = await Promise.all(items.map(async m => {
    const meta = await fetchTitleMeta(m.id);
    return { id: m.id, type: m.type, name: meta.name, poster: meta.poster || undefined, releaseInfo: meta.year || undefined };
  }));
  res.json({ metas });
});

app.get('/catalog/:type/:id/search=:query.json', async (req, res) => {
  const movies = await loadMovies();
  const q = decodeURIComponent(req.params.query).toLowerCase();
  const items = movies.filter(m => m.type === req.params.type);
  const resolved = await Promise.all(items.map(async m => ({ m, meta: await fetchTitleMeta(m.id) })));
  const metas = resolved
    .filter(({ m, meta }) => m.id.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q))
    .map(({ m, meta }) => ({ id: m.id, type: m.type, name: meta.name, poster: meta.poster || undefined, releaseInfo: meta.year || undefined }));
  res.json({ metas });
});

// ── Meta ──────────────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', async (req, res) => {
  const movies = await loadMovies();
  const item = movies.find(m => m.id === req.params.id && m.type === req.params.type);
  if (!item) return res.json({ meta: null });
  const meta = await fetchTitleMeta(item.id);
  res.json({ meta: { id: item.id, type: item.type, name: meta.name, poster: meta.poster || undefined, releaseInfo: meta.year || undefined } });
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const movies = await loadMovies();

  if (type === 'movie') {
    const m = movies.find(x => x.id === id && x.type === 'movie');
    if (m) {
      const streams = [];
      if (m.streamUrl1080p) streams.push({ title: 'AdharAlo Cloud 1080p Stream', url: m.streamUrl1080p });
      if (m.streamUrl720p) streams.push({ title: 'AdharAlo Cloud 720p Stream', url: m.streamUrl720p });
      if (m.streamUrl) streams.push({ title: 'AdharAlo Cloud Source Raw Feed', url: m.streamUrl });
      return res.json({ streams });
    }
  } else if (type === 'series') {
    const match = id.match(/(tt\d+):(\d+):(\d+)/);
    if (match) {
      const imdbId = match[1], season = parseInt(match[2]), episode = parseInt(match[3]);
      const s = movies.find(x => x.id === imdbId && x.type === 'series');
      if (s && s.episodes) {
        const ep = s.episodes.find(e => e.season === season && e.episode === episode);
        if (ep && ep.streamUrl) {
          return res.json({ streams: [{ title: `AdharAlo Series S${season}E${episode}`, url: ep.streamUrl }] });
        }
      }
    }
  }
  res.json({ streams: [] });
});

// Fallback serve static UI admin engine dashboard panel
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => console.log(`Enterprise Gateway Node Listening on Port: ${PORT}`));
