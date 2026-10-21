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

// Ping endpoint
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'PelisMaster TV Server activo', timestamp: Date.now() });
});

export default router;
