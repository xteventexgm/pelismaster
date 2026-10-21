import * as cheerio from 'cheerio';
import { memoryCache } from '../utils/cache.js';

const BASE_URL = 'https://pelismaster.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const fetchHtml = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
};

const extractHighestImg = ($el, fallback = '') => {
  if (!$el || $el.length === 0) return fallback;
  // Try picture source with max width
  let srcset = $el.find('source[type="image/webp"]').last().attr('srcset') ||
                $el.find('source').last().attr('srcset');
  if (srcset) {
    const parts = srcset.split(',').map(s => s.trim().split(' '));
    if (parts.length > 0) {
      return parts[parts.length - 1][0];
    }
  }
  const src = $el.find('img').attr('src') || $el.attr('src');
  return src || fallback;
};

export const getHome = async () => {
  const cacheKey = 'pelis:home';
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const html = await fetchHtml(BASE_URL);
  const $ = cheerio.load(html);

  // 1. Hero Billboard
  const heroes = [];
  $('section.bb .slide').each((i, el) => {
    const $slide = $(el);
    const id = $slide.attr('id') || `hero-${i}`;
    let backdrop = extractHighestImg($slide.find('picture.bg'));
    if (!backdrop) {
      const tplContent = $slide.find('template.bb-art, template').html();
      if (tplContent) {
        const $tpl = cheerio.load(tplContent);
        backdrop = extractHighestImg($tpl('picture.bg, picture, img'));
      }
    }
    const $titleContainer = $slide.find('.bb-t');
    const logoImg = $titleContainer.find('.bb-logo img').attr('src') || null;
    const title = logoImg ? ($titleContainer.find('.bb-logo img').attr('alt') || '') : $titleContainer.text().trim();
    
    // Meta (rating, year, duration/seasons)
    let match = '';
    let year = '';
    let duration = '';
    $slide.find('.meta').first().find('span').each((_, s) => {
      const txt = $(s).text().trim();
      if ($(s).hasClass('match') || txt.includes('%')) match = txt;
      else if (/^\d{4}$/.test(txt)) year = txt;
      else if (txt) duration = txt;
    });

    // Genres
    const genres = [];
    $slide.find('.meta').eq(1).find('span').each((_, s) => {
      const g = $(s).text().replace('•', '').trim();
      if (g) genres.push(g);
    });

    const overview = $slide.find('.bb-ov').text().trim();
    const playHref = $slide.find('.cta a.btn-play').attr('href') || '';
    const infoHref = $slide.find('.cta a.btn-grey').attr('href') || playHref;

    const isSeries = infoHref.includes('/series/');
    const slug = infoHref.replace(/^\/(movie|series)\//, '').split('#')[0].split('?')[0];

    heroes.push({
      id,
      title,
      logoImg,
      backdrop,
      match,
      year,
      duration,
      genres,
      overview,
      type: isSeries ? 'series' : 'movie',
      slug,
      url: infoHref
    });
  });

  // 2. Top 10 de hoy
  const top10 = [];
  $('section.row:has(.rail.top) a.t10').each((i, el) => {
    const $t = $(el);
    const href = $t.attr('href') || '';
    const isSeries = href.includes('/series/');
    const slug = href.replace(/^\/(movie|series)\//, '').split('?')[0];
    const poster = extractHighestImg($t.find('.t10-img'));
    const title = $t.find('.t10-img img').attr('alt') || slug;

    top10.push({
      rank: i + 1,
      title,
      poster,
      slug,
      type: isSeries ? 'series' : 'movie',
      url: href
    });
  });

  // 3. Rails / Rows
  const rails = [];
  $('div.rows > section.row').each((_, row) => {
    const $row = $(row);
    // Ignore Top 10 or empty recent/list rows
    if ($row.find('.rail.top').length > 0 || $row.attr('id') === 'row-recent' || $row.attr('id') === 'row-list') {
      return;
    }

    const title = $row.find('.row-t').text().trim();
    if (!title) return;

    const moreUrl = $row.find('.more').attr('href') || '';
    const items = [];

    $row.find('.rail a.cd').each((_, item) => {
      const $it = $(item);
      const href = $it.attr('href') || '';
      const isSeries = href.includes('/series/') || $it.find('.tag').text().toLowerCase().includes('serie');
      const slug = href.replace(/^\/(movie|series)\//, '').split('?')[0];
      const backdrop = extractHighestImg($it);
      const itemTitle = $it.find('.cd-t').text().trim();
      const match = $it.find('.cd-m .match').text().trim();
      let year = '';
      let metaExtra = '';

      $it.find('.cd-m span').each((_, s) => {
        const txt = $(s).text().trim();
        if (/^\d{4}$/.test(txt)) year = txt;
        else if (txt && !$(s).hasClass('match')) metaExtra = txt;
      });

      items.push({
        title: itemTitle || slug,
        backdrop,
        isSeries,
        type: isSeries ? 'series' : 'movie',
        slug,
        match,
        year,
        metaExtra,
        url: href
      });
    });

    if (items.length > 0) {
      rails.push({
        title,
        moreUrl,
        items
      });
    }
  });

  const result = {
    heroes,
    top10,
    rails
  };

  memoryCache.set(cacheKey, result, 300); // 5 minutes
  return result;
};

export const getCatalog = async (type = 'movies', sort = 'recent', page = 1) => {
  const cacheKey = `pelis:catalog:${type}:${sort}:${page}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const targetPath = page > 1 ? `/${type}/page/${page}?sort=${sort}` : `/${type}?sort=${sort}`;
  const html = await fetchHtml(`${BASE_URL}${targetPath}`);
  const $ = cheerio.load(html);

  const totalTitles = $('h1.h1').next('.lead').text().trim() || $('.lh .lead').text().trim();
  const items = [];

  $('.grid a.cd, .grid article.ml').each((_, el) => {
    const $card = $(el).is('a.cd') ? $(el) : $(el).find('a.cd');
    const href = $card.attr('href') || '';
    const isSeries = href.includes('/series/') || type === 'series';
    const slug = href.replace(/^\/(movie|series)\//, '').split('?')[0];
    const image = extractHighestImg($card);
    const title = $card.find('.cd-t').text().trim() || $(el).find('.ml-b h3, .ml-b h2, .ml-b .cd-t').text().trim();
    const match = $card.find('.match').text().trim() || $(el).find('.match').text().trim();
    
    let year = '';
    let metaExtra = '';
    $card.find('.cd-m span, .meta span').each((_, s) => {
      const txt = $(s).text().trim();
      if (/^\d{4}$/.test(txt)) year = txt;
      else if (txt && !$(s).hasClass('match') && !$(s).hasClass('box')) metaExtra = txt;
    });

    if (slug) {
      items.push({
        title: title || slug,
        image,
        type: isSeries ? 'series' : 'movie',
        slug,
        match,
        year,
        metaExtra,
        url: href
      });
    }
  });

  const hasNextPage = $('.pager a:contains("›")').length > 0 || $('.pager a[rel="next"]').length > 0;

  const result = {
    type,
    sort,
    page: parseInt(page, 10),
    totalTitles,
    hasNextPage,
    items
  };

  memoryCache.set(cacheKey, result, 300);
  return result;
};

export const getGenres = async () => {
  const cacheKey = 'pelis:genres';
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const html = await fetchHtml(`${BASE_URL}/genres`);
  const $ = cheerio.load(html);

  const genres = [];
  $('.grid a.gt').each((_, el) => {
    const $g = $(el);
    const href = $g.attr('href') || '';
    const slug = href.replace('/genre/', '').replace('/', '');
    const name = $g.find('span').contents().first().text().trim();
    const count = $g.find('small').text().trim();
    const image = extractHighestImg($g);

    if (slug && name) {
      genres.push({
        name,
        slug,
        count,
        image,
        url: href
      });
    }
  });

  memoryCache.set(cacheKey, genres, 1800); // 30 min
  return genres;
};

export const getGenreItems = async (slug, page = 1) => {
  const cacheKey = `pelis:genre:${slug}:${page}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const targetPath = page > 1 ? `/genre/${slug}/page/${page}` : `/genre/${slug}`;
  const html = await fetchHtml(`${BASE_URL}${targetPath}`);
  const $ = cheerio.load(html);

  const title = $('h1.h1').text().trim() || slug;
  const totalCount = $('.lh .lead').text().trim();
  const items = [];

  $('.grid a.cd, .grid article.ml').each((_, el) => {
    const $card = $(el).is('a.cd') ? $(el) : $(el).find('a.cd');
    const href = $card.attr('href') || '';
    const isSeries = href.includes('/series/');
    const itemSlug = href.replace(/^\/(movie|series)\//, '').split('?')[0];
    const image = extractHighestImg($card);
    const itemTitle = $card.find('.cd-t').text().trim();
    const match = $card.find('.match').text().trim();

    let year = '';
    let metaExtra = '';
    $card.find('.cd-m span').each((_, s) => {
      const txt = $(s).text().trim();
      if (/^\d{4}$/.test(txt)) year = txt;
      else if (txt && !$(s).hasClass('match')) metaExtra = txt;
    });

    if (itemSlug) {
      items.push({
        title: itemTitle || itemSlug,
        image,
        type: isSeries ? 'series' : 'movie',
        slug: itemSlug,
        match,
        year,
        metaExtra,
        url: href
      });
    }
  });

  const hasNextPage = $('.pager a:contains("›")').length > 0;
  const result = {
    title,
    totalCount,
    slug,
    page: parseInt(page, 10),
    hasNextPage,
    items
  };

  memoryCache.set(cacheKey, result, 300);
  return result;
};

export const search = async (query) => {
  if (!query || query.trim().length === 0) return [];
  const q = encodeURIComponent(query.trim());

  // 1. Try instant suggest API first
  try {
    const suggestRes = await fetch(`${BASE_URL}/api/suggest?q=${q}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    });
    if (suggestRes.ok) {
      const data = await suggestRes.json();
      if (data && data.titles && data.titles.length > 0) {
        return data.titles.map(item => {
          const isSeries = item.type === 'tv' || item.type === 'series' || item.url.includes('/series/');
          const slug = item.url.replace(/^\/(movie|series)\//, '').split('?')[0];
          return {
            title: item.title,
            image: item.poster,
            year: item.year,
            rating: item.rating ? `${Math.round(item.rating * 10)}%` : '',
            type: isSeries ? 'series' : 'movie',
            slug,
            url: item.url
          };
        });
      }
    }
  } catch (e) {
    console.error('Suggest error:', e.message);
  }

  // 2. Fallback to HTML search page
  const html = await fetchHtml(`${BASE_URL}/search?q=${q}`);
  const $ = cheerio.load(html);
  const items = [];

  $('.grid a.cd, .grid article.ml').each((_, el) => {
    const $card = $(el).is('a.cd') ? $(el) : $(el).find('a.cd');
    const href = $card.attr('href') || '';
    const isSeries = href.includes('/series/');
    const slug = href.replace(/^\/(movie|series)\//, '').split('?')[0];
    const image = extractHighestImg($card);
    const title = $card.find('.cd-t').text().trim();
    const match = $card.find('.match').text().trim();

    if (slug) {
      items.push({
        title: title || slug,
        image,
        type: isSeries ? 'series' : 'movie',
        slug,
        match,
        url: href
      });
    }
  });

  return items;
};

export const getDetail = async (type = 'movie', slugPath) => {
  const cacheKey = `pelis:detail:${type}:${slugPath}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/${type}/${slugPath}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Breadcrumbs
  const breadcrumbs = [];
  $('nav.crumbs a').each((_, c) => {
    breadcrumbs.push({ name: $(c).text().trim(), url: $(c).attr('href') });
  });

  // Title & Logo
  const $titleCont = $('section.tp .bb-t, section.tp h1');
  const logoImg = $titleCont.find('.bb-logo img').attr('src') || null;
  const title = logoImg ? ($titleCont.find('.bb-logo img').attr('alt') || '') : $titleCont.text().trim();

  // Backdrop
  const backdrop = extractHighestImg($('section.tp picture.bg'));

  // Meta badges
  let match = '';
  let year = '';
  let classification = '';
  let duration = '';
  $('section.tp .meta span, section.tp .meta a').each((_, m) => {
    const txt = $(m).text().trim();
    if ($(m).hasClass('match') || txt.includes('%')) match = txt;
    else if (/^\d{4}$/.test(txt)) year = txt;
    else if ($(m).hasClass('box')) classification = txt;
    else if (txt && !duration) duration = txt;
  });

  // Tagline & Overview
  const tagline = $('section.tp .tag-line').text().trim();
  const overview = $('section.tp .bb-ov').text().trim();

  // Side metadata (Cast, Director, Genres, Tags)
  let director = '';
  const castList = [];
  const genres = [];
  const tags = [];

  $('section.tp .side p').each((_, p) => {
    const label = $(p).find('span').text().toLowerCase();
    const links = $(p).find('a');
    if (label.includes('direcci')) {
      director = links.first().text().trim();
    } else if (label.includes('reparto')) {
      links.each((_, a) => castList.push($(a).text().trim()));
    } else if (label.includes('género')) {
      links.each((_, a) => genres.push($(a).text().trim()));
    } else if (label.includes('tag')) {
      links.each((_, a) => tags.push($(a).text().trim()));
    }
  });

  // Full Cast with Avatar Photos
  const castMembers = [];
  $('.rail.cast a.pp').each((_, c) => {
    const $pp = $(c);
    const actorName = $pp.find('.pp-t').text().trim();
    const character = $pp.find('.pp-m').text().trim();
    const avatar = extractHighestImg($pp.find('.pp-img'));
    if (actorName) {
      castMembers.push({
        actor: actorName,
        character,
        avatar
      });
    }
  });

  // Facts / Acerca de
  const facts = {};
  $('dl.facts > div').each((_, d) => {
    const key = $(d).find('dt').text().trim();
    const val = $(d).find('dd').text().trim();
    if (key && val) facts[key] = val;
  });

  // Similar Titles
  const similarTitles = [];
  const seenSimilar = new Set();
  $('section.sec:has(h2:contains("similares")) article.ml').each((_, sim) => {
    const $card = $(sim).find('a.cd');
    const simHref = $card.attr('href') || '';
    const simType = simHref.includes('/series/') ? 'series' : 'movie';
    const simSlug = simHref.replace(/^\/(movie|series)\//, '').split('?')[0];
    if (!simSlug || seenSimilar.has(simSlug)) return;
    seenSimilar.add(simSlug);

    const simImg = extractHighestImg($card);
    const simTitle = $card.find('.cd-t').text().trim();
    const simMatch = $card.find('.match').text().trim();
    let simYear = '';
    $card.find('.cd-m span').each((_, s) => {
      const txt = $(s).text().trim();
      if (/^\d{4}$/.test(txt)) simYear = txt;
    });

    similarTitles.push({
      title: simTitle || simSlug,
      image: simImg,
      type: simType,
      slug: simSlug,
      match: simMatch,
      year: simYear,
      url: simHref
    });
  });

  // Series Seasons & Episodes (if type is series)
  const seasons = [];
  const episodes = [];
  let currentSeasonNum = 1;

  if (type === 'series') {
    // Seasons tabs (chips)
    $('nav.chips a.chip').each((_, ch) => {
      const $ch = $(ch);
      const name = $ch.text().trim();
      const href = $ch.attr('href') || '';
      const numMatch = name.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0], 10) : 0;
      const isCurrent = $ch.hasClass('on') || $ch.attr('aria-current') === 'page';
      if (isCurrent && num) currentSeasonNum = num;

      seasons.push({
        name,
        seasonNumber: num,
        isSpecial: name.toLowerCase().includes('especial'),
        url: href,
        isCurrent
      });
    });

    // Episodes in list
    $('.eps a.ep').each((_, ep) => {
      const $ep = $(ep);
      const epHref = $ep.attr('href') || '';
      const epNum = $ep.find('.ep-n').text().trim();
      const epThumbnail = extractHighestImg($ep.find('.ep-img'));
      const epDuration = $ep.find('.ep-d').text().trim();
      const epTitle = $ep.find('.ep-t').text().trim();
      const epDate = $ep.find('.ep-s').text().trim();
      const epOverview = $ep.find('.ep-o').text().trim();
      const isCurrent = $ep.hasClass('on');

      // extract season & episode from href (/series/name/season/37/episode/1)
      const sMatch = epHref.match(/season\/(\d+)/);
      const eMatch = epHref.match(/episode\/(\d+)/);

      episodes.push({
        number: parseInt(epNum, 10) || (eMatch ? parseInt(eMatch[1], 10) : 1),
        season: sMatch ? parseInt(sMatch[1], 10) : currentSeasonNum,
        title: epTitle,
        thumbnail: epThumbnail,
        duration: epDuration,
        airDate: epDate,
        overview: epOverview,
        url: epHref,
        isCurrent
      });
    });
  }

  // Player Pass Data
  // Extract data-pass from .facade or player HTML
  const passMatch = html.match(/data-pass=(?:&quot;|")([^&"]+)(?:&quot;|")/);
  const playerPassUrl = passMatch ? passMatch[1] : null;

  // Extract TMDB ID from data-pass or embed
  let tmdbId = null;
  if (playerPassUrl) {
    const tmdbMatch = playerPassUrl.match(/(?:movie|tv):(\d+):/);
    if (tmdbMatch) tmdbId = tmdbMatch[1];
  }

  const result = {
    type,
    slug: slugPath,
    title,
    logoImg,
    backdrop,
    breadcrumbs,
    tagline,
    rating: match,
    classification,
    year,
    duration,
    overview,
    director,
    genres,
    tags,
    cast: castMembers.length > 0 ? castMembers : castList.map(a => ({ actor: a, character: '', avatar: '' })),
    facts,
    similarTitles,
    seasons: seasons.length > 0 ? seasons : undefined,
    episodes: episodes.length > 0 ? episodes : undefined,
    currentSeason: type === 'series' ? currentSeasonNum : undefined,
    player: {
      hasStream: !!playerPassUrl,
      playerPassUrl,
      tmdbId,
      refererUrl: url
    }
  };

  memoryCache.set(cacheKey, result, 600);
  return result;
};
