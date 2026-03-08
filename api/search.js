import Parser from "rss-parser";
import crypto from "crypto";
import SOURCES from "./sources-data.js";
import { norm, toArticleRecord } from "./article-pipeline.js";
import { translateToFrench } from "./translation-service.js";

const parser = new Parser({ timeout: 15000 });
const SEARCH_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map();
const translationCache = new Map();

const TOKEN_TRANSLATIONS = new Map();
[
  ["afrique", "africa"],["asie", "asia"],["oceanie", "oceania"],["amerique", "america"],
  ["australie", "australia"],["chine", "china"],["japon", "japan"],["coree", "korea"],
  ["allemagne", "germany"],["angleterre", "england"],["etats", "states"],["etats-unis", "united"]
].forEach(([fr, en]) => { TOKEN_TRANSLATIONS.set(fr, en); TOKEN_TRANSLATIONS.set(en, fr); });

function expandTokens(tokens) {
  const out = new Set();
  tokens.forEach(token => {
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
  const hay = norm([item.title, item.summary, item.content, item.source, item.category_label, item.country, ...(item.entities || [])].join(" "));
  return tokens.some(t => hay.includes(t));
}

function setCachingHeaders(req, res, payload) {
  const body = JSON.stringify(payload);
  const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex")}"`;
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

async function translateTitleToFrench(title, language) {
  if (!title) return { title: "", originalTitle: "" };
  const key = `${language || "und"}::${title}`;
  const cached = translationCache.get(key);
  if (cached) return cached;

  const translated = await translateToFrench(title, language);
  const value = {
    title: translated.text || title,
    originalTitle: title,
    titleLanguage: translated.language || language || "und"
  };
  translationCache.set(key, value);
  return value;
}

export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString();
    const keys = (req.query.sources || "").toString().split(",").map(s => s.trim()).filter(Boolean);
    const selected = keys.length === 0 || keys.includes("all") ? SOURCES : SOURCES.filter(s => keys.includes(s.key));
    if (selected.length === 0) {
      res.status(400).json({ error: "Aucune source sélectionnée." });
      return;
    }

    const cacheKey = `${q}::${selected.map(s => s.key).join(",")}`;
    const now = Date.now();
    const hit = searchCache.get(cacheKey);
    if (hit && now - hit.ts < SEARCH_TTL_MS) {
      if (setCachingHeaders(req, res, hit.payload)) return;
      res.status(200).json(hit.payload);
      return;
    }

    const items = [];
    const warnings = [];
    const results = await Promise.allSettled(selected.map(async source => {
      const feed = await parser.parseURL(source.url);
      for (const raw of (feed.items || [])) {
        const mapped = toArticleRecord(raw, source);
        if (!mapped) continue;
        if (matchesQuery(mapped, q)) items.push(mapped);
      }
    }));

    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        warnings.push({
          sourceKey: selected[idx].key,
          sourceName: selected[idx].name,
          error: String(result.reason?.message || result.reason || "Erreur inconnue")
        });
      }
    });

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const seen = new Set();
    const dedup = [];
    for (const it of items) {
      const key = it.url || `${it.source}-${it.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(it);
    }

    const limitedItems = dedup.slice(0, 80);
    const localizedItems = await Promise.all(limitedItems.map(async item => {
      const translatedTitle = await translateTitleToFrench(item.title, item.language_detected);
      return {
        ...item,
        title: translatedTitle.title,
        originalTitle: translatedTitle.originalTitle,
        titleLanguage: translatedTitle.titleLanguage
      };
    }));

    const payload = { q, count: dedup.length, items: localizedItems, warnings };
    searchCache.set(cacheKey, { ts: now, payload });
    if (setCachingHeaders(req, res, payload)) return;
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: "Erreur récupération RSS", details: String(e?.message || e) });
  }
}
