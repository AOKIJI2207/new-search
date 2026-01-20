import Parser from "rss-parser";
import SOURCES from "./sources-data.js";

const parser = new Parser({ timeout: 15000 });

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(item, query) {
  const q = norm(query);
  if (!q) return true;

  const tokens = q.split(" ").filter(Boolean);
  const expanded = expandTokens(tokens);
  const hay = norm([item.title, item.contentSnippet, item.content, item.summary].filter(Boolean).join(" "));
  if (expanded.length === 0) return true;

  // OR logique : au moins un mot doit être présent
  return expanded.some(t => hay.includes(t));
}

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
  ["nigeria", "nigéria"],
  ["etats", "states"],
  ["etats-unis", "united"]
].forEach(([fr, en]) => {
  TOKEN_TRANSLATIONS.set(fr, en);
  TOKEN_TRANSLATIONS.set(en, fr);
});

function expandTokens(tokens) {
  const out = new Set();
  tokens.forEach(token => {
    out.add(token);
    const mapped = TOKEN_TRANSLATIONS.get(token);
    if (mapped) out.add(norm(mapped));
  });
  return Array.from(out);
}

function compactItem(it, source) {
  return {
    sourceKey: source.key,
    sourceName: source.name,
    title: it.title || "",
    link: it.link || "",
    pubDate: it.isoDate || it.pubDate || "",
    snippet: (it.contentSnippet || it.summary || "").slice(0, 320)
  };
}

export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString();
    const keys = (req.query.sources || "")
      .toString()
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const selected = keys.length === 0 || keys.includes("all")
      ? SOURCES
      : SOURCES.filter(s => keys.includes(s.key));
    if (selected.length === 0) {
      res.status(400).json({ error: "Aucune source sélectionnée." });
      return;
    }

    const items = [];
    const warnings = [];
    const results = await Promise.allSettled(selected.map(async s => {
      const feed = await parser.parseURL(s.url);
      for (const it of (feed.items || [])) {
        if (matchesQuery(it, q)) items.push(compactItem(it, s));
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

    if (items.length === 0 && warnings.length === selected.length) {
      res.status(502).json({ error: "Impossible de récupérer les flux RSS.", warnings });
      return;
    }

    items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    // dedupe par lien
    const seen = new Set();
    const dedup = [];
    for (const it of items) {
      const k = it.link || (it.sourceName + it.title);
      if (!seen.has(k)) {
        seen.add(k);
        dedup.push(it);
      }
    }

    res.status(200).json({ q, count: dedup.length, items: dedup.slice(0, 80), warnings });
  } catch (e) {
    res.status(500).json({ error: "Erreur récupération RSS", details: String(e?.message || e) });
  }
}
