import Parser from "rss-parser";
import crypto from "crypto";
import SOURCES from "./sources-data.js";
import { toArticleRecord } from "./article-pipeline.js";
import { translateToFrench } from "./translation-service.js";

const parser = new Parser({ timeout: 15000 });
const TICKER_TTL_MS = 5 * 60 * 1000;
let tickerCache = null;

function setHeaders(req, res, payload) {
  const json = JSON.stringify(payload);
  const etag = `W/"${crypto.createHash("sha1").update(json).digest("hex")}"`;
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=900");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (tickerCache && now - tickerCache.ts < TICKER_TTL_MS) {
      if (setHeaders(req, res, tickerCache.payload)) return;
      res.status(200).json(tickerCache.payload);
      return;
    }

    const rawItems = [];
    await Promise.allSettled(SOURCES.slice(0, 25).map(async source => {
      const feed = await parser.parseURL(source.url);
      for (const item of (feed.items || []).slice(0, 8)) {
        const mapped = toArticleRecord(item, source);
        if (mapped) rawItems.push(mapped);
      }
    }));

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

    const translatedItems = await Promise.all(unique.map(async item => {
      const titleFr = await translateToFrench(item.title, item.language_detected);
      const summaryFr = await translateToFrench(item.summary, item.language_detected);
      return {
        ...item,
        title_fr: titleFr.text,
        summary_fr: summaryFr.text
      };
    }));

    const payload = { updatedAt: new Date().toISOString(), items: translatedItems };
    tickerCache = { ts: now, payload };
    if (setHeaders(req, res, payload)) return;
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: "Ticker indisponible", details: String(error?.message || error) });
  }
}
