import { Router } from 'express';
import { getHome, getCatalog, getGenres, getGenreItems, search, getDetail } from '../services/scraper.js';
import { getServers, resolveStream } from '../services/streamResolver.js';

const router = Router();

// GET /api/home
router.get('/home', async (req, res) => {
  try {
    const data = await getHome();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/movies
router.get('/movies', async (req, res) => {
  try {
    const sort = req.query.sort || 'recent';
    const page = parseInt(req.query.page, 10) || 1;
    const data = await getCatalog('movies', sort, page);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/series
router.get('/series', async (req, res) => {
  try {
    const sort = req.query.sort || 'recent';
    const page = parseInt(req.query.page, 10) || 1;
    const data = await getCatalog('series', sort, page);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/genres
router.get('/genres', async (req, res) => {
  try {
    const data = await getGenres();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/genre/:slug
router.get('/genre/:slug', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const data = await getGenreItems(req.params.slug, page);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/search?q=...
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const data = await search(q);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/detail/:type/:slug(*)
router.get('/detail/:type/:slug(*)', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const data = await getDetail(type, slug);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/servers/:type/:slug
router.get('/servers/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const { season, episode } = req.query;
    const data = await getServers({
      type,
      slug,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/stream/:type/:slug
router.get('/stream/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const { season, episode, serverId, lang } = req.query;
    const data = await resolveStream({
      type,
      slug,
      season: season ? parseInt(season, 10) : undefined,
      episode: episode ? parseInt(episode, 10) : undefined,
      serverId,
      preferredLang: lang || 'LAT'
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/proxy/stream.m3u8?url=... (also supports /api/proxy/m3u8)
// Proxies m3u8 playlists through this server to avoid 403 "sesión no coincide" IP session errors on cloud deployments
router.get(['/proxy/stream.m3u8', '/proxy/m3u8'], async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const targetUrl = decodeURIComponent(rawUrl);
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const m3uRes = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://pelismaster.com/',
        'User-Agent': USER_AGENT,
        'Accept': '*/*'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!m3uRes.ok) {
      return res.status(m3uRes.status).send(`Failed to fetch m3u8: HTTP ${m3uRes.status}`);
    }

    const playlistText = await m3uRes.text();

    // Parse and rewrite nested .m3u8 / moviemaster links to route through this proxy
    const lines = playlistText.split('\n');
    const rewritten = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      let absUrl = trimmed;
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        try {
          absUrl = new URL(trimmed, targetUrl).href;
        } catch(e) {
          absUrl = trimmed;
        }
      }

      // If this line is another playlist (.m3u8 or moviemaster.lat /s/ stream), proxy it
      if (absUrl.includes('.m3u8') || absUrl.includes('moviemaster.lat')) {
        return `/api/proxy/stream.m3u8?url=${encodeURIComponent(absUrl)}`;
      }

      // Direct media segment chunk (TikTok CDN, Akamai, etc.) stays direct for max speed
      return absUrl;
    }).join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.end(Buffer.from(rewritten, 'utf-8'));
  } catch (err) {
    console.error('m3u8 proxy error:', err.message);
    res.status(500).send(err.message);
  }
});

// Ping endpoint
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'PelisMaster TV Server activo', timestamp: Date.now() });
});

export default router;

