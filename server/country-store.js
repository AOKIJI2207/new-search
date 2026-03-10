import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONTINENTS_PATH = path.join(DATA_DIR, "continents.json");
const COUNTRIES_PATH = path.join(DATA_DIR, "countries.json");
const PROFILES_DIR = path.join(DATA_DIR, "countries");
const ALLOWED_CONTINENTS = JSON.parse(fs.readFileSync(CONTINENTS_PATH, "utf-8"));

let payloadCache = null;

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
  return ALLOWED_CONTINENTS.slice();
}

export function loadCountriesByContinent() {
  const grouped = readJson(COUNTRIES_PATH);
  for (const continent of ALLOWED_CONTINENTS) {
    if (!Array.isArray(grouped[continent])) {
      throw new Error(`Missing continent key in countries.json: ${continent}`);
    }
  }
  return grouped;
}

export function flattenCountries() {
  const grouped = loadCountriesByContinent();
  const entries = [];

  for (const continent of ALLOWED_CONTINENTS) {
    for (const name of grouped[continent]) {
      entries.push({ name, continent, slug: slugify(name) });
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

export function loadCountryProfileBySlug(slug) {
  const safeSlug = slugify(slug);
  const filePath = path.join(PROFILES_DIR, `${safeSlug}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJson(filePath);
}

export function findCountryEntry(query) {
  const target = normalize(query);
  if (!target) return null;

  return (
    flattenCountries().find((entry) => {
      return normalize(entry.name) === target || entry.slug === target.replace(/\s+/g, "-");
    }) || null
  );
}

function buildLegacyProfile(entry, profile) {
  return {
    country: profile.name,
    displayName: profile.name,
    countryId: entry.slug,
    iso2: null,
    iso3: null,
    continent: profile.continent,
    headOfState: profile.key_data.head_of_state,
    rulingParty: profile.key_data.political_system,
    primeMinister: null,
    governor: null,
    nextElection: null,
    isDemocracy: null,
    rsfRank: profile.key_data.corruption_index || "Non publié",
    rsfScore: null,
    gdpPerCapita: profile.key_data.gdp_per_capita,
    ratings: {
      security: profile.risk_barometer.crime,
      business: profile.risk_barometer.socio_economic,
      health: profile.risk_barometer.health_disasters,
      expat: profile.risk_barometer.transport,
      overall: profile.risk_global
    },
    summary: profile.analysis.summary,
    canonical: profile
  };
}

function getLatestUpdatedAt() {
  const files = fs.readdirSync(PROFILES_DIR).filter((file) => file.endsWith(".json"));
  const latestMs = files.reduce((current, file) => {
    const stat = fs.statSync(path.join(PROFILES_DIR, file));
    return Math.max(current, stat.mtimeMs);
  }, fs.statSync(COUNTRIES_PATH).mtimeMs);
  return new Date(latestMs).toISOString();
}

function buildPayload() {
  const entries = flattenCountries();
  const profiles = {};
  const canonicalProfiles = {};

  for (const entry of entries) {
    const profile = loadCountryProfileBySlug(entry.slug);
    if (!profile) {
      throw new Error(`Missing country profile file for ${entry.name}`);
    }
    if (profile.name !== entry.name) {
      throw new Error(`Profile name mismatch for ${entry.slug}`);
    }
    if (profile.continent !== entry.continent) {
      throw new Error(`Profile continent mismatch for ${entry.slug}`);
    }
    profiles[entry.name] = buildLegacyProfile(entry, profile);
    canonicalProfiles[entry.slug] = profile;
  }

  return {
    updatedAt: getLatestUpdatedAt(),
    manifest: {
      source: "data",
      totalCountries: entries.length,
      continents: loadContinents()
    },
    catalog: entries,
    profiles,
    canonicalProfiles
  };
}

export function getCountryProfilesPayload({ forceRefresh = false } = {}) {
  if (!payloadCache || forceRefresh) {
    payloadCache = buildPayload();
  }
  return payloadCache;
}

export function refreshCountryProfilesPayload() {
  payloadCache = buildPayload();
  return payloadCache;
}

export function getCountrySearchIndex() {
  const payload = getCountryProfilesPayload();
  return {
    updatedAt: payload.updatedAt,
    countries: payload.catalog.map((entry) => ({
      name: entry.name,
      slug: entry.slug,
      continent: entry.continent
    })),
    continents: loadContinents().map((name) => ({
      name,
      slug: slugify(name)
    }))
  };
}
