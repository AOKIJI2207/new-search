import crypto from "node:crypto";
import SOURCES from "./sources-data.js";
import { norm, toArticleRecord } from "./article-pipeline.js";
import { translateToFrench } from "./translation-service.js";
import {
  findCountryEntry,
  getCountryProfilesPayload,
  getCountrySearchIndex,
  loadContinents,
  flattenCountries,
  loadCountryProfileBySlug,
  refreshCountryProfilesPayload,
  slugify
} from "./country-store.js";

const SEARCH_TTL_MS = 5 * 60 * 1000;
const TICKER_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map();
const titleTranslationCache = new Map();
let tickerCache = null;
let parserInstance = null;

const TOKEN_TRANSLATIONS = new Map();
[
  ["afrique", "africa"],
  ["asie", "asia"],
  ["oceanie", "oceania"],
  ["amerique", "america"],
  ["australie", "australia"],
  ["chine", "china"],
  ["japon", "japan"],
  ["coree", "korea"],
  ["allemagne", "germany"],
  ["angleterre", "england"],
  ["etats", "states"],
  ["etats-unis", "united"]
].forEach(([fr, en]) => {
  TOKEN_TRANSLATIONS.set(fr, en);
  TOKEN_TRANSLATIONS.set(en, fr);
});

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCachingHeaders(req, res, payload, cacheControl) {
  const body = JSON.stringify(payload);
  const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex")}"`;
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  return false;
}

function expandTokens(tokens) {
  const out = new Set();
  tokens.forEach((token) => {
    out.add(token);
    const mapped = TOKEN_TRANSLATIONS.get(token);
    if (mapped) out.add(norm(mapped));
  });
  return Array.from(out);
}

function matchesQuery(item, query) {
  const q = norm(query);
  if (!q) return true;
  const tokens = expandTokens(q.split(" ").filter(Boolean));
  const hay = norm([
    item.title,
    item.summary,
    item.content,
    item.source,
    item.category_label,
    item.country,
    ...(item.entities || [])
  ].join(" "));
  return tokens.some((token) => hay.includes(token));
}

async function getParser() {
  if (parserInstance) return parserInstance;
  const { default: Parser } = await import("rss-parser");
  parserInstance = new Parser({ timeout: 15000 });
  return parserInstance;
}

async function translateTitleToFrench(title, language) {
  if (!title) {
    return { title: "", originalTitle: "" };
  }

  const key = `${language || "und"}::${title}`;
  const cached = titleTranslationCache.get(key);
  if (cached) return cached;

  const translated = await translateToFrench(title, language);
  const value = {
    title: translated.text || title,
    originalTitle: title,
    titleLanguage: translated.language || language || "und"
  };
  titleTranslationCache.set(key, value);
  return value;
}

async function handleSources(req, res) {
  if (setCachingHeaders(req, res, SOURCES, "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400")) {
    return;
  }
  json(res, 200, SOURCES);
}

async function handleSearch(req, res) {
  try {
    const parser = await getParser();
    const q = String(req.query.q || "");
    const keys = String(req.query.sources || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const selected = keys.length === 0 || keys.includes("all") ? SOURCES : SOURCES.filter((source) => keys.includes(source.key));
    if (!selected.length) {
      json(res, 400, { error: "Aucune source sélectionnée." });
      return;
    }

    const cacheKey = `${q}::${selected.map((source) => source.key).join(",")}`;
    const now = Date.now();
    const hit = searchCache.get(cacheKey);
    if (hit && now - hit.ts < SEARCH_TTL_MS) {
      if (setCachingHeaders(req, res, hit.payload, "public, max-age=60, s-maxage=300, stale-while-revalidate=600")) {
        return;
      }
      json(res, 200, hit.payload);
      return;
    }

    const items = [];
    const warnings = [];
    const results = await Promise.allSettled(
      selected.map(async (source) => {
        const feed = await parser.parseURL(source.url);
        for (const raw of feed.items || []) {
          const mapped = toArticleRecord(raw, source);
          if (mapped && matchesQuery(mapped, q)) {
            items.push(mapped);
          }
        }
      })
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        warnings.push({
          sourceKey: selected[index].key,
          sourceName: selected[index].name,
          error: String(result.reason?.message || result.reason || "Erreur inconnue")
        });
      }
    });

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const seen = new Set();
    const dedup = [];
    for (const item of items) {
      const key = item.url || `${item.source}-${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(item);
    }

    const localizedItems = await Promise.all(
      dedup.slice(0, 80).map(async (item) => {
        const translatedTitle = await translateTitleToFrench(item.title, item.language_detected);
        return {
          ...item,
          title: translatedTitle.title,
          originalTitle: translatedTitle.originalTitle,
          titleLanguage: translatedTitle.titleLanguage
        };
      })
    );

    const payload = { q, count: dedup.length, items: localizedItems, warnings };
    searchCache.set(cacheKey, { ts: now, payload });
    if (setCachingHeaders(req, res, payload, "public, max-age=60, s-maxage=300, stale-while-revalidate=600")) {
      return;
    }
    json(res, 200, payload);
  } catch (error) {
    json(res, 500, { error: "Erreur récupération RSS", details: String(error?.message || error) });
  }
}

async function handleTicker(req, res) {
  try {
    const parser = await getParser();
    const now = Date.now();
    if (tickerCache && now - tickerCache.ts < TICKER_TTL_MS) {
      if (setCachingHeaders(req, res, tickerCache.payload, "public, max-age=120, s-maxage=300, stale-while-revalidate=900")) {
        return;
      }
      json(res, 200, tickerCache.payload);
      return;
    }

    const rawItems = [];
    await Promise.allSettled(
      SOURCES.slice(0, 25).map(async (source) => {
        const feed = await parser.parseURL(source.url);
        for (const item of (feed.items || []).slice(0, 8)) {
          const mapped = toArticleRecord(item, source);
          if (mapped) rawItems.push(mapped);
        }
      })
    );

    rawItems.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const unique = [];
    const seen = new Set();
    for (const item of rawItems) {
      const key = item.url || `${item.source}-${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
      if (unique.length >= 24) break;
    }

    const translatedItems = await Promise.all(
      unique.map(async (item) => {
        const titleFr = await translateToFrench(item.title, item.language_detected);
        const summaryFr = await translateToFrench(item.summary, item.language_detected);
        return {
          ...item,
          title_fr: titleFr.text,
          summary_fr: summaryFr.text
        };
      })
    );

    const payload = { updatedAt: new Date().toISOString(), items: translatedItems };
    tickerCache = { ts: now, payload };
    if (setCachingHeaders(req, res, payload, "public, max-age=120, s-maxage=300, stale-while-revalidate=900")) {
      return;
    }
    json(res, 200, payload);
  } catch (error) {
    json(res, 500, { error: "Ticker indisponible", details: String(error?.message || error) });
  }
}

async function handleTranslation(req, res) {
  try {
    const text = String(req.query.q || req.query.text || "");
    const sourceLang = String(req.query.sourceLang || "") || null;
    const translated = await translateToFrench(text, sourceLang);
    json(res, 200, translated);
  } catch (error) {
    json(res, 500, {
      text: String(req.query.q || ""),
      language: "und",
      error: String(error?.message || error)
    });
  }
}

async function handleSearchIndex(req, res) {
  try {
    const payload = getCountrySearchIndex();
    if (setCachingHeaders(req, res, payload, "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400")) {
      return;
    }
    json(res, 200, payload);
  } catch (error) {
    json(res, 500, { error: "Index recherche indisponible", details: String(error?.message || error) });
  }
}

async function handleCountryProfiles(req, res) {
  try {
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const payload = getCountryProfilesPayload({ forceRefresh });
    if (setCachingHeaders(req, res, payload, "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400")) {
      return;
    }
    json(res, 200, payload);
  } catch (error) {
    json(res, 500, {
      error: "Impossible de récupérer les profils pays.",
      details: String(error?.message || error)
    });
  }
}

async function handleRefreshCountryProfiles(_req, res) {
  try {
    const payload = refreshCountryProfilesPayload();
    json(res, 200, {
      status: "refreshed",
      updatedAt: payload.updatedAt
    });
  } catch (error) {
    json(res, 500, {
      error: "Impossible de rafraîchir les profils pays.",
      details: String(error?.message || error)
    });
  }
}

async function handleCountries(req, res) {
  try {
    const countries = flattenCountries();
    if (setCachingHeaders(req, res, { count: countries.length, countries }, "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400")) {
      return;
    }
    json(res, 200, { count: countries.length, countries });
  } catch (error) {
    json(res, 500, { error: "Unable to load countries", details: String(error?.message || error) });
  }
}

async function handleCountryProfile(req, res) {
  try {
    const query = String(req.query.country || req.query.id || req.query.iso3 || "").trim();
    if (!query) {
      json(res, 400, { error: "Missing country query parameter" });
      return;
    }

    const entry = findCountryEntry(query);
    if (!entry) {
      json(res, 404, { error: `Country profile not found for ${query}` });
      return;
    }

    const profile = loadCountryProfileBySlug(entry.slug);
    if (!profile) {
      json(res, 404, { error: `Country profile not found for ${query}` });
      return;
    }

    json(res, 200, {
      ...profile,
      catalog: entry
    });
  } catch (error) {
    json(res, 500, { error: "Unable to load country profile", details: String(error?.message || error) });
  }
}

export async function handleCountryRequest(req, res) {
  try {
    const countryParam = Array.isArray(req.query.country) ? req.query.country[0] : req.query.country;
    const slug = slugify(String(countryParam || ""));
    if (!slug) {
      json(res, 400, { error: "Missing country parameter" });
      return;
    }

    const profile = loadCountryProfileBySlug(slug);
    if (!profile) {
      json(res, 404, { error: `Country not found: ${slug}` });
      return;
    }

    if (setCachingHeaders(req, res, profile, "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400")) {
      return;
    }
    json(res, 200, profile);
  } catch (error) {
    json(res, 500, { error: "Unable to load country profile", details: String(error?.message || error) });
  }
}

export async function handleHubRequest(req, res) {
  const route = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const segment = slugify(String(route || ""));

  switch (segment) {
    case "sources":
      await handleSources(req, res);
      return;
    case "search":
      await handleSearch(req, res);
      return;
    case "ticker":
      await handleTicker(req, res);
      return;
    case "translation-service":
      await handleTranslation(req, res);
      return;
    case "search-index":
      await handleSearchIndex(req, res);
      return;
    case "country-profiles":
      await handleCountryProfiles(req, res);
      return;
    case "refresh-country-profiles":
      await handleRefreshCountryProfiles(req, res);
      return;
    case "countries":
      await handleCountries(req, res);
      return;
    case "country-profile":
      await handleCountryProfile(req, res);
      return;
    case "continents":
      json(res, 200, loadContinents());
      return;
    default:
      json(res, 404, { error: `Unknown API route: ${segment || "root"}` });
  }
}
