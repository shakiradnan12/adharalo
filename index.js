const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 7000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adnan123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'xK9mP2vL7qR4nW8z';

// GitHub config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'shakiradnan12/adharalo';
const GITHUB_FILE = 'movies.json';
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

app.get('/api/movies', async (req, res) => {
  const data = await loadMovies();
  res.json(data);
});

// BUG FIX BLOCK: Dynamic Request Mutex Array Queue Map Protection
app.post('/api/movies', requireAuth, async (req, res) => {
  const item = req.body;
  if (!item || !item.id) return res.status(400).json({ error: 'Missing core body signature' });

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
  res.json({
    id: 'org.adharalo.ftpaddon',
    version: '1.5.0',
    name: 'AdharAlo Support By Adnan',
    description: 'Enterprise Premium Streaming Gateway for Personal Library Stream Nodes.',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
  });
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
