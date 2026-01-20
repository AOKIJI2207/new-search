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
  const hay = norm([item.title, item.contentSnippet, item.content, item.summary].filter(Boolean).join(" "));
  // AND logique : tous les mots doivent être présents
  return tokens.every(t => hay.includes(t));
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

    const selected = SOURCES.filter(s => keys.includes(s.key));
    if (selected.length === 0) {
      res.status(400).json({ error: "Aucune source sélectionnée." });
      return;
    }

    const items = [];
    for (const s of selected) {
      const feed = await parser.parseURL(s.url);
      for (const it of (feed.items || [])) {
        if (matchesQuery(it, q)) items.push(compactItem(it, s));
      }
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

    res.status(200).json({ q, count: dedup.length, items: dedup.slice(0, 80) });
  } catch (e) {
    res.status(500).json({ error: "Erreur récupération RSS", details: String(e?.message || e) });
  }
}
