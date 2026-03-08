import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { detectLanguage, hashKey } from "./article-pipeline.js";

const execFileAsync = promisify(execFile);
const CACHE_FILE = path.join(process.cwd(), "assets", "translations-cache.json");
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map();

async function readDiskCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const data = JSON.parse(raw);
    Object.entries(data).forEach(([key, val]) => memoryCache.set(key, val));
  } catch (_e) {}
}

async function persistDiskCache() {
  const obj = Object.fromEntries(memoryCache.entries());
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(obj));
}

let loaded = false;
async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  await readDiskCache();
}

function parseGooglePayload(data, text, sourceLang) {
  const translated = Array.isArray(data?.[0]) ? data[0].map(chunk => chunk[0] || "").join("") : text;
  const detected = data?.[2] || sourceLang || detectLanguage(text);
  return { translated: translated || text, detected };
}

async function googleTranslate(text, sourceLang) {
  const sl = sourceLang && sourceLang !== "und" ? sourceLang : "auto";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Translation HTTP ${res.status}`);
    const data = await res.json();
    return parseGooglePayload(data, text, sourceLang);
  } catch (_fetchErr) {
    const { stdout } = await execFileAsync("curl", ["-s", url], { maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout || "[]");
    return parseGooglePayload(data, text, sourceLang);
  }
}

export async function translateToFrench(text, sourceLang = null) {
  await ensureLoaded();
  if (!text) return { text: "", language: "und" };
  const language = sourceLang || detectLanguage(text);
  if (language === "fr") return { text, language: "fr" };

  const key = hashKey(`${text}::${language}::fr`);
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && now - cached.ts < TTL_MS) {
    return { text: cached.translated, language: cached.detected || language };
  }

  try {
    const translated = await googleTranslate(text, language);
    memoryCache.set(key, { ts: now, translated: translated.translated, detected: translated.detected });
    await persistDiskCache();
    return { text: translated.translated, language: translated.detected || language };
  } catch (_err) {
    return { text, language };
  }
}


export default async function handler(req, res) {
  try {
    const text = (req.query?.q || req.query?.text || "").toString();
    const sourceLang = (req.query?.sourceLang || "").toString() || null;
    const translated = await translateToFrench(text, sourceLang);
    res.status(200).json(translated);
  } catch (e) {
    res.status(500).json({ text: (req.query?.q || "").toString(), language: "und", error: String(e?.message || e) });
  }
}
