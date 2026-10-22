import { getDetail } from './scraper.js';
import { memoryCache } from '../utils/cache.js';

const BASE_URL = 'https://pelismaster.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Retrieves valid servers for a movie or episode
 */
export const getServers = async ({ type = 'movie', slug, season, episode }) => {
  if (type === 'series') {
    if (!season) season = 1;
    if (!episode) episode = 1;
  }

  const cacheKey = `pelis:servers:${type}:${slug}:${season || 0}:${episode || 0}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  // 1. Get detail page to obtain playerPassUrl & tmdbId
  let detailSlug = slug;
  if (type === 'series') {
    detailSlug = `${slug}/season/${season}/episode/${episode}`;
  }
  const detail = await getDetail(type, detailSlug);

  if (!detail.player || !detail.player.playerPassUrl) {
    throw new Error('No se encontró el reproductor para este contenido');
  }

  const { playerPassUrl, tmdbId, refererUrl } = detail.player;

  // 2. Obtain signed pass token from pelismaster.com
  const passRes = await fetch(`${BASE_URL}${playerPassUrl}`, {
    headers: {
      'Referer': refererUrl,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (!passRes.ok) {
    throw new Error(`Error obteniendo pase del reproductor: HTTP ${passRes.status}`);
  }

  const passData = await passRes.json();
  if (!passData.pass) {
    throw new Error('El pase del reproductor vino vacío');
  }

  // 3. Query api-encrypted.moviemaster.lat for servers
  const apiType = type === 'series' ? 'tv' : 'movie';
  let serversQuery = `tmdb=${tmdbId}&type=${apiType}&pass=${passData.pass}`;
  if (type === 'series') {
    serversQuery += `&season=${season}&episode=${episode}`;
  }

  const serversUrl = `https://api-encrypted.moviemaster.lat/servers?${serversQuery}`;
  const srvRes = await fetch(serversUrl, {
    headers: {
      'Referer': 'https://pelismaster.com/',
      'User-Agent': USER_AGENT
    }
  });

  if (!srvRes.ok) {
    throw new Error(`Error obteniendo servidores: HTTP ${srvRes.status}`);
  }

  const srvData = await srvRes.json();
  const rawServers = srvData.servers || [];

  // Map and group servers
  const servers = rawServers.map(s => ({
    id: s.id,
    key: s.k || s.id,
    name: s.name || `Servidor`,
    lang: s.lang, // 'LAT', 'ESP', 'SUB', 'ENG'
    mode: s.mode, // 'directo' | 'proxy'
    type: s.type, // 'hls' | 'mp4' | 'iframe'
    isDirect: s.mode === 'directo',
    detras: !!s.detras
  }));

  const result = {
    tmdbId,
    type,
    season,
    episode,
    title: detail.title,
    backdrop: detail.backdrop,
    servers
  };

  memoryCache.set(cacheKey, result, 300); // 5 minutes cache
  return result;
};

/**
 * Resolves the actual playable stream URL (HLS / MP4) with automatic fallback and caching
 */
export const resolveStream = async ({ type = 'movie', slug, season, episode, serverId, preferredLang = 'LAT' }) => {
  if (type === 'series') {
    if (!season) season = 1;
    if (!episode) episode = 1;
  }

  const cacheKey = `pelis:stream:${type}:${slug}:${season || 0}:${episode || 0}:${serverId || preferredLang}`;
  const cachedStream = memoryCache.get(cacheKey);
  if (cachedStream) return cachedStream;

  const serverInfo = await getServers({ type, slug, season, episode });
  const { servers, tmdbId } = serverInfo;

  if (!servers || servers.length === 0) {
    throw new Error('No hay servidores disponibles para este título');
  }

  // Build candidate servers list in order of preference
  const candidates = [];
  if (serverId) {
    const s = servers.find(x => x.id === serverId);
    if (s) candidates.push(s);
  }

  // Filter by preferred language first, direct servers first
  const langDirect = servers.filter(s => s.lang === preferredLang && s.isDirect);
  const anyDirect = servers.filter(s => s.lang !== preferredLang && s.isDirect);
  const langOther = servers.filter(s => s.lang === preferredLang && !s.isDirect);
  const anyOther = servers.filter(s => s.lang !== preferredLang && !s.isDirect);

  const pool = [...langDirect, ...anyDirect, ...langOther, ...anyOther];
  for (let p = 0; p < pool.length; p++) {
    const s = pool[p];
    if (!candidates.find(c => c.id === s.id)) {
      candidates.push(s);
    }
  }

  const apiType = type === 'series' ? 'tv' : 'movie';
  let resolvedData = null;
  let usedServer = null;
  let lastError = null;

  // Try candidate servers in sequence (up to 5 attempts)
  const maxAttempts = Math.min(candidates.length, 5);
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = candidates[i];
    try {
      let videoQuery = `tmdb=${tmdbId}&type=${apiType}&noiframe=1&embed=${encodeURIComponent(candidate.id)}&r=1`;
      if (type === 'series' && season && episode) {
        videoQuery += `&season=${season}&episode=${episode}`;
      }

      const videoUrl = `https://api-encrypted.moviemaster.lat/video?${videoQuery}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const vidRes = await fetch(videoUrl, {
        headers: {
          'Referer': 'https://pelismaster.com/',
          'User-Agent': USER_AGENT
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!vidRes.ok) continue;

      const vidData = await vidRes.json();
      if (vidData && vidData.url) {
        resolvedData = vidData;
        usedServer = candidate;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!resolvedData || !resolvedData.url) {
    throw new Error(lastError ? lastError.message : 'No se pudo reproducir este video con los servidores disponibles');
  }

  let streamUrl = resolvedData.url;
  // If the stream is an HLS playlist or comes from moviemaster.lat, route it via our m3u8 proxy
  // to avoid "403 sesión no coincide" IP session mismatches when deployed on cloud/Render
  if (streamUrl && (streamUrl.includes('.m3u8') || streamUrl.includes('moviemaster.lat'))) {
    streamUrl = `/api/proxy/m3u8?url=${encodeURIComponent(streamUrl)}`;
  }

  const result = {
    streamUrl: streamUrl,
    streamType: resolvedData.type || usedServer.type || 'hls',
    server: usedServer,
    title: serverInfo.title,
    availableServers: servers
  };

  // Cache resolved stream for 20 minutes
  memoryCache.set(cacheKey, result, 1200);
  return result;
};
