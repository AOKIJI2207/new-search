import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const CONTINENTS_PATH = path.join(DATA_DIR, "continents.json");
const COUNTRIES_PATH = path.join(DATA_DIR, "countries.json");
const PROFILES_DIR = path.join(DATA_DIR, "countries");
const SOURCE_CATALOG_PATH = path.join(ROOT, "country_profiles", "data", "catalog", "countries.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value = "") {
  return normalize(value).replace(/\s+/g, "-");
}

export function loadContinents() {
  return readJson(CONTINENTS_PATH);
}

export function loadCountriesByContinent() {
  const grouped = readJson(COUNTRIES_PATH);
  for (const continent of loadContinents()) {
    if (!Array.isArray(grouped[continent])) {
      throw new Error(`Missing continent key in countries.json: ${continent}`);
    }
  }
  return grouped;
}

export function loadSourceCatalog() {
  return readJson(SOURCE_CATALOG_PATH);
}

export function flattenCountries() {
  const grouped = loadCountriesByContinent();
  const sourceByName = new Map(loadSourceCatalog().map((country) => [country.english_name, country]));
  const entries = [];

  for (const continent of loadContinents()) {
    for (const name of grouped[continent]) {
      const source = sourceByName.get(name);
      entries.push({
        name,
        continent,
        slug: slugify(name),
        iso2: source?.iso2 || null,
        iso3: source?.iso3 || null,
        country_id: source?.country_id || null
      });
    }
  }

  const uniqueSlugs = new Set(entries.map((entry) => entry.slug));
  if (entries.length !== 195) {
    throw new Error(`Expected 195 countries, found ${entries.length}`);
  }
  if (uniqueSlugs.size !== entries.length) {
    throw new Error("Duplicate country slugs detected in /data/countries.json");
  }

  return entries;
}

export function findCountryEntry(query) {
  const target = normalize(query);
  if (!target) return null;

  return (
    flattenCountries().find((entry) => {
      return [
        entry.name,
        entry.slug,
        entry.iso2,
        entry.iso3,
        entry.country_id
      ].some((value) => normalize(value || "") === target || String(value || "").toLowerCase() === target);
    }) || null
  );
}

export function getCountryFilePath(slug) {
  return path.join(PROFILES_DIR, `${slugify(slug)}.json`);
}

export function loadCountryProfileBySlug(slug) {
  const filePath = getCountryFilePath(slug);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

export function writeCountryProfileBySlug(slug, payload) {
  fs.writeFileSync(getCountryFilePath(slug), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
