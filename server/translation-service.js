import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectLanguage, hashKey } from "./article-pipeline.js";

const execFileAsync = promisify(execFile);
const CACHE_FILE = path.join(os.tmpdir(), "agoraflux-translations-cache.json");
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map();

let loaded = false;

async function readDiskCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const data = JSON.parse(raw);
    Object.entries(data).forEach(([key, value]) => memoryCache.set(key, value));
  } catch (_error) {}
}

async function persistDiskCache() {
  try {
    const payload = Object.fromEntries(memoryCache.entries());
    await fs.writeFile(CACHE_FILE, JSON.stringify(payload), "utf-8");
  } catch (_error) {}
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  await readDiskCache();
}

function parseGooglePayload(data, text, sourceLang) {
  const translated = Array.isArray(data?.[0]) ? data[0].map((chunk) => chunk[0] || "").join("") : text;
  const detected = data?.[2] || sourceLang || detectLanguage(text);
  return { translated: translated || text, detected };
}

async function googleTranslate(text, sourceLang) {
  const sl = sourceLang && sourceLang !== "und" ? sourceLang : "auto";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=fr&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation HTTP ${response.status}`);
    }
    const data = await response.json();
    return parseGooglePayload(data, text, sourceLang);
  } catch (_fetchError) {
    const { stdout } = await execFileAsync("curl", ["-s", url], { maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout || "[]");
    return parseGooglePayload(data, text, sourceLang);
  }
}

export async function translateToFrench(text, sourceLang = null) {
  await ensureLoaded();

  if (!text) {
    return { text: "", language: "und" };
  }

  const language = sourceLang || detectLanguage(text);
  if (language === "fr") {
    return { text, language: "fr" };
  }

  const key = hashKey(`${text}::${language}::fr`);
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && now - cached.ts < TTL_MS) {
    return { text: cached.translated, language: cached.detected || language };
  }

  try {
    const translated = await googleTranslate(text, language);
    memoryCache.set(key, {
      ts: now,
      translated: translated.translated,
      detected: translated.detected
    });
    await persistDiskCache();
    return { text: translated.translated, language: translated.detected || language };
  } catch (_error) {
    return { text, language };
  }
}
