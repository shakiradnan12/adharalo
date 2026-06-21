[README.md](https://github.com/user-attachments/files/29173156/README.md)
<div align="center">

# 🎬 ADHARALO
### *Your Personal Cinema Server — Powered by Stremio*

[![Status](https://img.shields.io/badge/Status-Live-00d084?style=for-the-badge&logo=statuspage&logoColor=white)](https://adharalo-addon-ftp.onrender.com)
[![Stremio](https://img.shields.io/badge/Stremio-Addon-8A5FFF?style=for-the-badge&logo=stremio&logoColor=white)](https://adharalo-addon-ftp.onrender.com/manifest.json)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Render](https://img.shields.io/badge/Hosted_on-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![GitHub](https://img.shields.io/badge/Storage-GitHub_API-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com)

<br/>

> **AdharAlo** is a self-hosted, personal Stremio addon that streams movies and TV series directly from your own FTP/HTTP server — with a stunning premium admin panel to manage everything.

<br/>

```
  ▄████████ ████████▄     ██░ ██  ▄▄▄       ██▀███   ▄▄▄       ██▓     ▒█████  
 ██▒ ▀█▀ ██▀ ▀████▀▀██   ▓██░ ██▒▒████▄    ▓██ ▒ ██▒▒████▄    ▓██▒    ▒██▒  ██▒
▒██░▄▄▄░▒██   ▒██   ▒██  ▒██▀▀██░▒██  ▀█▄  ▓██ ░▄█ ▒▒██  ▀█▄  ▒██░    ▒██░  ██▒
░▓█  ██▓░██   ░██   ░██░ ░▓█ ░██ ░██▄▄▄▄██ ▒██▀▀█▄  ░██▄▄▄▄██ ▒██░    ▒██   ██░
░▒▓███▀▒░██████████████░ ░▓█▒░██▓ ▓█   ▓██▒░██▓ ▒██▒ ▓█   ▓██▒░██████▒░ ████▓▒░
```

</div>

---

## ✨ What is AdharAlo?

AdharAlo is a **fully self-hosted Stremio addon** built for people who have their own FTP/HTTP movie servers and want a clean, premium way to stream them directly in Stremio — on any device, anywhere.

No subscriptions. No third-party dependencies. Just your server, your content, your control.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🎬 **Movie Streaming** | Stream movies directly from your FTP/HTTP server |
| 📺 **TV Series Support** | Full season & episode management |
| 🖼️ **Netflix-style Admin Panel** | Beautiful grid & list views with posters |
| 🔍 **OMDb Integration** | Auto-fetches posters, ratings & genres |
| 💾 **GitHub as Database** | Persistent storage — survives server restarts |
| 🔐 **Password Protected** | Secure admin panel login |
| 📡 **Real-time Updates** | Add content, instantly available in Stremio |
| 📱 **Multi-Quality Support** | 1080p, 720p, and default stream per title |
| 🔎 **Live Search & Filter** | Search by title, filter episodes by season |
| 📊 **Stats Dashboard** | See total movies, series, and episodes at a glance |

---

## 🎥 How It Works

```
Your FTP Server          AdharAlo Addon           Stremio App
─────────────           ──────────────           ───────────
  movies/         ──→   Admin Panel      ──→    Movie Page
  series/              (add links)              Stream Button
  episodes/                ↓                       ↓
                     GitHub saves              Plays instantly
                     movies.json               on any device
```

---

## 🛠️ Tech Stack

- **Runtime:** Node.js + Express
- **Storage:** GitHub API (persistent, survives restarts)
- **Metadata:** OMDb API (posters, ratings, genres)
- **Hosting:** Render (free tier)
- **Frontend:** Vanilla HTML/CSS/JS — zero dependencies
- **Fonts:** Syne + Inter (Google Fonts)

---

## 📦 Project Structure

```
adharalo/
├── index.js          → Main server & Stremio API endpoints
├── admin.html        → Premium admin panel UI
├── movies.json       → Content database (managed via GitHub API)
├── package.json      → Dependencies
├── render.yaml       → Render deployment config
└── README.md         → You are here
```

---

## ⚙️ Environment Variables

Set these in your Render dashboard under **Environment**:

| Variable | Description | Example |
|---|---|---|
| `ADMIN_PASSWORD` | Admin panel login password | `yourpassword` |
| `SESSION_SECRET` | Session encryption key | `anyRandomString` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxxxxxxxxxx` |
| `GITHUB_REPO` | Your GitHub repo path | `username/reponame` |

---

## 🚀 Deploy on Render

**1. Fork or clone this repo to your GitHub**

**2. Go to [render.com](https://render.com) → New Web Service**

**3. Connect your GitHub repo and set:**
```
Build Command:  npm install
Start Command:  npm start
```

**4. Add Environment Variables (see above)**

**5. Deploy! Your addon will be live at:**
```
https://your-app.onrender.com
```

---

## 📲 Install in Stremio

**Option A — One Click:**
```
Open: https://your-app.onrender.com
Click: "Stremio Install" button
```

**Option B — Manual:**
```
Stremio → Addons → Install from URL →
https://your-app.onrender.com/manifest.json
```

---

## 🎛️ Admin Panel Guide

Visit `https://your-app.onrender.com` and login with your password.

### Adding a Movie
1. Go to **Movie** tab in sidebar
2. Paste IMDB link or ID (e.g. `tt0816692`)
3. Paste your FTP HTTP stream URL
4. Optionally add 1080p / 720p URLs
5. Click **Deploy Movie** ✅

### Adding a TV Series Episode
1. Go to **Series** tab in sidebar
2. Paste the series IMDB ID
3. Set Season and Episode number
4. Paste the episode stream URL
5. Click **Link Episode** ✅

> Episode number auto-increments after each add — bulk adding is fast!

---

## 🔗 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /manifest.json` | Stremio addon manifest |
| `GET /stream/movie/:id.json` | Get stream URL for a movie |
| `GET /stream/series/:id/:season/:episode.json` | Get stream URL for an episode |
| `GET /catalog/movie/ftp_movies.json` | Movie catalog |
| `GET /catalog/series/ftp_series.json` | Series catalog |
| `GET /api/movies` | All content (auth required) |
| `POST /api/movies` | Add movie/episode (auth required) |
| `DELETE /api/movies/:id` | Remove content (auth required) |

---

## 🔒 Security Notes

- Admin panel is **password protected** — change default password immediately
- Never share your `GITHUB_TOKEN` or `ADMIN_PASSWORD` publicly
- Keep your Render environment variables private
- FTP stream URLs are only returned to authenticated Stremio sessions

---

## 📡 Keep Alive (Recommended)

Render free tier sleeps after 15 minutes of inactivity. Use **UptimeRobot** to keep it awake:

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free)
2. Add new HTTP monitor
3. URL: `https://your-app.onrender.com/manifest.json`
4. Interval: Every 5 minutes ✅

---

## 🗺️ Roadmap

- [ ] Bulk episode import (paste multiple URLs at once)
- [ ] Subtitle URL support per episode
- [ ] Watch history tracking
- [ ] Multiple user support
- [ ] Auto-scan FTP directory

---

## 👨‍💻 Built By

<div align="center">

**Adnan** — *Because great cinema deserves great software.*

[![GitHub](https://img.shields.io/badge/GitHub-shakiradnan12-181717?style=flat-square&logo=github)](https://github.com/shakiradnan12)

*AdharAlo — আলো ছড়াও, সিনেমা দেখাও।*

</div>

---

<div align="center">
<sub>Made with ❤️ for movie lovers · Self-hosted · No ads · No tracking</sub>
</div>
