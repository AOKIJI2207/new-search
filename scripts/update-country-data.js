import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  flattenCountries,
  loadCountryProfileBySlug,
  writeCountryProfileBySlug
} from "../server/country-store.js";

const ROOT = process.cwd();
const LOGS_DIR = path.join(ROOT, "logs");
const REPORT_PATH = path.join(LOGS_DIR, "update-country-data-report.json");
const REQUEST_TIMEOUT_MS = 6000;
const REFERENCE_DIR = path.join(ROOT, "data", "reference");
const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_CONFIRMED_IMF_YEAR = CURRENT_YEAR - 2;

const WORLD_BANK_INDICATORS = {
  population: "SP.POP.TOTL",
  gdp: "NY.GDP.MKTP.CD",
  gdp_per_capita: "NY.GDP.PCAP.CD",
  growth: "NY.GDP.MKTP.KD.ZG",
  inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS"
};

const IMF_SERIES = {
  growth: "NGDP_RPCH",
  inflation: "PCPIPCH"
};

const REFERENCE_FILES = {
  hdi: "undp-hdi.json",
  corruption_index: "transparency-cpi.json",
  political_stability: "freedom-house.json",
  conflict_risk: "acled-conflict-index.json",
  terrorism_risk: "global-terrorism-index.json",
  military_expenditure: "sipri-military-expenditure.json",
  peace_index: "global-peace-index.json"
};

const REFERENCE_CACHE = new Map();
let freedomHouseScoresCache = null;
const TRANSPARENCY_SLUG_OVERRIDES = {
  "Czechia": "czech-republic",
  "DR Congo": "democratic-republic-of-the-congo",
  "Republic of the Congo": "republic-of-the-congo",
  "Ivory Coast": "cote-divoire",
  "Türkiye": "turkiye",
  "Vatican City": "holy-see"
};

const FREEDOM_HOUSE_NAME_ALIASES = {
  "cabo verde": "cape verde",
  "czechia": "czech republic",
  "dr congo": "congo kinshasa",
  "ivory coast": "cote d ivoire",
  "laos": "lao pdr",
  "micronesia": "micronesia federated states of",
  "north korea": "korea north",
  "north macedonia": "macedonia",
  "palestine": "west bank",
  "republic of the congo": "congo brazzaville",
  "south korea": "korea south",
  "timor-leste": "east timor",
  "turkiye": "turkey",
  "united states": "united states of america",
  "vatican city": "holy see"
};

function withTimeout(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: withTimeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function readReferenceDataset(fileName) {
  if (REFERENCE_CACHE.has(fileName)) {
    return REFERENCE_CACHE.get(fileName);
  }

  try {
    const payload = JSON.parse(await fs.readFile(path.join(REFERENCE_DIR, fileName), "utf-8"));
    REFERENCE_CACHE.set(fileName, payload);
    return payload;
  } catch (_error) {
    REFERENCE_CACHE.set(fileName, {});
    return {};
  }
}

async function lookupReference(field, iso3) {
  const fileName = REFERENCE_FILES[field];
  if (!fileName || !iso3) return null;
  const dataset = await readReferenceDataset(fileName);
  return dataset[iso3] || null;
}

function normalizeSlug(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .trim();
}

function normalizeCountryKey(value = "") {
  return normalizeSlug(value)
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSupplementalObjects(profile) {
  const next = structuredClone(profile);
  next.intelligence_indicators ||= {};
  next.data_sources ||= {};

  for (const key of ["political_stability", "conflict_risk", "terrorism_risk", "military_expenditure"]) {
    next.intelligence_indicators[key] ||= {
      value: null,
      display: "",
      source: "",
      year: ""
    };
  }

  for (const key of ["population", "gdp", "gdp_per_capita", "growth", "inflation", "unemployment", "hdi", "corruption_index", "political_stability", "conflict_risk", "terrorism_risk", "military_expenditure"]) {
    next.data_sources[key] ||= {
      source: "",
      year: ""
    };
  }

  return next;
}

function pickLatestValue(records = []) {
  if (!Array.isArray(records)) return null;
  const match = records.find((item) => item && item.value !== null && item.value !== undefined);
  if (!match) return null;
  return {
    value: Number(match.value),
    year: String(match.date || "")
  };
}

async function fetchWorldBankValue(iso2, indicator) {
  if (!iso2) return null;
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(iso2)}/indicator/${indicator}?format=json&per_page=10&mrv=5`;
  const payload = await fetchJson(url);
  const hit = pickLatestValue(payload?.[1]);
  return hit ? { ...hit, source: "World Bank" } : null;
}

async function fetchImfValue(iso3, series) {
  if (!iso3) return null;
  const url = `https://www.imf.org/external/datamapper/api/v1/${series}/${encodeURIComponent(iso3)}`;
  const payload = await fetchJson(url);
  const seriesNode = payload?.values?.[series]?.[iso3];
  if (!seriesNode || typeof seriesNode !== "object") return null;
  const years = Object.keys(seriesNode).sort((a, b) => Number(b) - Number(a));
  for (const year of years) {
    if (Number(year) > MAX_CONFIRMED_IMF_YEAR) {
      continue;
    }
    const value = Number(seriesNode[year]);
    if (Number.isFinite(value)) {
      return { value, year, source: "IMF" };
    }
  }
  return null;
}

async function fetchUnDataHdi(iso3) {
  const local = await lookupReference("hdi", iso3);
  if (local) {
    return {
      value: Number(local.value),
      year: String(local.year || ""),
      source: local.source || "UNDP Human Development Reports"
    };
  }
  return null;
}

async function fetchTransparencyCpi(entry) {
  const local = await lookupReference("corruption_index", entry.iso3);
  if (local) {
    return {
      value: Number(local.value),
      year: String(local.year || ""),
      source: local.source || "Transparency International CPI"
    };
  }

  const countrySlug = TRANSPARENCY_SLUG_OVERRIDES[entry.name] || normalizeSlug(entry.name);
  const html = await fetch(`https://www.transparency.org/en/countries/${countrySlug}`, {
    signal: withTimeout(REQUEST_TIMEOUT_MS)
  }).then((response) => {
    if (!response.ok) throw new Error(`Transparency HTTP ${response.status}`);
    return response.text();
  });

  const scoreMatch = html.match(/Score\s*<\/[^>]+>\s*([0-9]{1,3})\/100/i) || html.match(/has a score of\s+([0-9]{1,3})/i);
  if (!scoreMatch) return null;
  return {
    value: Number(scoreMatch[1]),
    year: "2025",
    source: "Transparency International CPI"
  };
}

async function fetchFreedomHouseScore(entry) {
  const local = await lookupReference("political_stability", entry.iso3);
  if (local) {
    return {
      value: Number(local.value),
      year: String(local.year || ""),
      source: local.source || "Freedom House"
    };
  }

  if (!freedomHouseScoresCache) {
    const html = await fetch("https://freedomhouse.org/country/scores", {
      signal: withTimeout(REQUEST_TIMEOUT_MS)
    }).then((response) => {
      if (!response.ok) throw new Error(`Freedom House HTTP ${response.status}`);
      return response.text();
    });

    const scores = new Map();
    const rowPattern = /<td data-group="country_name"[^>]*>\s*<a [^>]*>([^<]+)<\/a>\s*<\/td>\s*<td data-group="fiw"[^>]*>[\s\S]*?<span class="score">([0-9]{1,3})<\/span>/gi;
    for (const match of html.matchAll(rowPattern)) {
      const sourceName = normalizeCountryKey(match[1]);
      const score = Number(match[2]);
      if (sourceName && Number.isFinite(score)) {
        scores.set(sourceName, score);
      }
    }
    freedomHouseScoresCache = scores;
  }

  const normalizedName = normalizeCountryKey(entry.name);
  const aliases = [
    normalizedName,
    normalizeCountryKey(FREEDOM_HOUSE_NAME_ALIASES[normalizedName] || ""),
    normalizeCountryKey(FREEDOM_HOUSE_NAME_ALIASES[normalizeSlug(entry.name)] || "")
  ].filter(Boolean);

  for (const candidate of aliases) {
    const score = freedomHouseScoresCache.get(candidate);
    if (Number.isFinite(score)) {
      return {
        value: score,
        year: "2025",
        source: "Freedom House"
      };
    }
  }

  return null;
}

async function fetchReferenceMetric(field, iso3, fallbackSourceLabel) {
  const local = await lookupReference(field, iso3);
  if (!local) return null;
  return {
    value: Number(local.value),
    year: String(local.year || ""),
    source: local.source || fallbackSourceLabel
  };
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatHdi(value) {
  return value.toFixed(3);
}

function keepExisting(existing, fallback = "Data unavailable") {
  if (existing !== null && existing !== undefined && String(existing).trim() !== "") {
    return String(existing);
  }
  return fallback;
}

function formatRiskBand(value) {
  return `${value}/5`;
}

function applyIndicator(profile, field, indicator) {
  if (!indicator || !Number.isFinite(indicator.value)) {
    return profile;
  }

  const next = ensureSupplementalObjects(profile);
  switch (field) {
    case "population":
      next.key_data.population = formatInteger(indicator.value);
      next.data_sources.population = { source: indicator.source, year: indicator.year };
      break;
    case "gdp":
      next.key_data.gdp = formatCurrency(indicator.value);
      next.data_sources.gdp = { source: indicator.source, year: indicator.year };
      break;
    case "gdp_per_capita":
      next.key_data.gdp_per_capita = formatCurrency(indicator.value);
      next.data_sources.gdp_per_capita = { source: indicator.source, year: indicator.year };
      break;
    case "growth":
      next.key_data.growth = formatPercent(indicator.value);
      next.data_sources.growth = { source: indicator.source, year: indicator.year };
      break;
    case "inflation":
      next.key_data.inflation = formatPercent(indicator.value);
      next.data_sources.inflation = { source: indicator.source, year: indicator.year };
      break;
    case "unemployment":
      next.key_data.unemployment = formatPercent(indicator.value);
      next.data_sources.unemployment = { source: indicator.source, year: indicator.year };
      break;
    case "hdi":
      next.key_data.hdi = formatHdi(indicator.value);
      next.data_sources.hdi = { source: indicator.source, year: indicator.year };
      break;
    case "corruption_index":
      next.key_data.corruption_index = String(Math.round(indicator.value));
      next.data_sources.corruption_index = { source: indicator.source, year: indicator.year };
      break;
    case "political_stability":
      next.intelligence_indicators.political_stability = {
        value: Number(indicator.value),
        display: `${Math.round(indicator.value)}/100`,
        source: indicator.source,
        year: indicator.year
      };
      next.data_sources.political_stability = { source: indicator.source, year: indicator.year };
      break;
    case "conflict_risk":
      next.intelligence_indicators.conflict_risk = {
        value: Number(indicator.value),
        display: formatRiskBand(indicator.value),
        source: indicator.source,
        year: indicator.year
      };
      next.data_sources.conflict_risk = { source: indicator.source, year: indicator.year };
      break;
    case "terrorism_risk":
      next.intelligence_indicators.terrorism_risk = {
        value: Number(indicator.value),
        display: formatRiskBand(indicator.value),
        source: indicator.source,
        year: indicator.year
      };
      next.data_sources.terrorism_risk = { source: indicator.source, year: indicator.year };
      break;
    case "military_expenditure":
      next.intelligence_indicators.military_expenditure = {
        value: Number(indicator.value),
        display: formatCurrency(indicator.value * 1_000_000),
        source: indicator.source,
        year: indicator.year
      };
      next.data_sources.military_expenditure = { source: indicator.source, year: indicator.year };
      break;
    default:
      break;
  }
  return next;
}

async function updateCountry(entry) {
  const profile = loadCountryProfileBySlug(entry.slug);
  if (!profile) {
    return { country: entry.name, slug: entry.slug, status: "missing_profile", updates: [], warnings: ["missing_profile"] };
  }

  let next = ensureSupplementalObjects(profile);
  next.key_data.population = keepExisting(next.key_data.population);
  next.key_data.gdp = keepExisting(next.key_data.gdp);
  next.key_data.gdp_per_capita = keepExisting(next.key_data.gdp_per_capita);
  next.key_data.growth = keepExisting(next.key_data.growth);
  next.key_data.inflation = keepExisting(next.key_data.inflation);
  next.key_data.unemployment = keepExisting(next.key_data.unemployment);
  next.key_data.hdi = keepExisting(next.key_data.hdi);

  const warnings = [];
  const updates = [];

  const worldBankResults = await Promise.allSettled(
    Object.entries(WORLD_BANK_INDICATORS).map(async ([field, indicator]) => {
      const value = await fetchWorldBankValue(entry.iso2, indicator);
      return { field, value };
    })
  );

  for (const result of worldBankResults) {
    if (result.status === "fulfilled" && result.value.value) {
      next = applyIndicator(next, result.value.field, result.value.value);
      updates.push({ field: result.value.field, source: result.value.value.source, year: result.value.value.year });
    } else if (result.status === "rejected") {
      warnings.push(String(result.reason?.message || result.reason));
    }
  }

  const imfResults = await Promise.allSettled(
    Object.entries(IMF_SERIES).map(async ([field, series]) => {
      const value = await fetchImfValue(entry.iso3, series);
      return { field, value };
    })
  );

  for (const result of imfResults) {
    if (result.status === "fulfilled" && result.value.value) {
      next = applyIndicator(next, result.value.field, result.value.value);
      updates.push({ field: result.value.field, source: result.value.value.source, year: result.value.value.year });
    } else if (result.status === "rejected") {
      warnings.push(String(result.reason?.message || result.reason));
    }
  }

  try {
    const hdi = await fetchUnDataHdi(entry.iso3);
    if (hdi) {
      next = applyIndicator(next, "hdi", hdi);
      updates.push({ field: "hdi", source: hdi.source, year: hdi.year });
    }
  } catch (error) {
    warnings.push(String(error?.message || error));
  }

  try {
    const corruption = await fetchTransparencyCpi(entry);
    if (corruption) {
      next = applyIndicator(next, "corruption_index", corruption);
      updates.push({ field: "corruption_index", source: corruption.source, year: corruption.year });
    }
  } catch (error) {
    warnings.push(String(error?.message || error));
  }

  try {
    const political = await fetchFreedomHouseScore(entry);
    if (political) {
      next = applyIndicator(next, "political_stability", political);
      updates.push({ field: "political_stability", source: political.source, year: political.year });
    }
  } catch (error) {
    warnings.push(String(error?.message || error));
  }

  for (const [field, sourceLabel] of [
    ["conflict_risk", "ACLED Conflict Index"],
    ["terrorism_risk", "Global Terrorism Database / Global Terrorism Index"],
    ["military_expenditure", "SIPRI Military Expenditure Database"]
  ]) {
    try {
      const indicator = await fetchReferenceMetric(field, entry.iso3, sourceLabel);
      if (indicator) {
        next = applyIndicator(next, field, indicator);
        updates.push({ field, source: indicator.source, year: indicator.year });
      }
    } catch (error) {
      warnings.push(String(error?.message || error));
    }
  }

  if (!next.intelligence_indicators.conflict_risk.display) {
    next = applyIndicator(next, "conflict_risk", {
      value: next.risk_global,
      year: "",
      source: "Derived fallback from AGORAFLUX baseline"
    });
  }

  if (!next.intelligence_indicators.terrorism_risk.display) {
    next = applyIndicator(next, "terrorism_risk", {
      value: next.risk_barometer.terrorism,
      year: "",
      source: "Derived fallback from AGORAFLUX baseline"
    });
  }

  writeCountryProfileBySlug(entry.slug, next);

  return {
    country: entry.name,
    slug: entry.slug,
    status: "updated",
    updates,
    warnings: [...new Set(warnings)]
  };
}

async function main() {
  const countries = flattenCountries();
  const results = [];
  const batchSize = 8;

  for (let index = 0; index < countries.length; index += batchSize) {
    const batch = countries.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((entry) => updateCountry(entry)));
    results.push(...batchResults);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalCountries: countries.length,
    updatedCountries: results.filter((item) => item.status === "updated").length,
    countriesWithWarnings: results.filter((item) => item.warnings.length > 0).length,
    results
  };

  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  const buildStep = spawnSync("node", ["scripts/build-platform-data.js"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });
  if (buildStep.status !== 0) {
    throw new Error("Failed to rebuild dashboard static data after country update.");
  }
  console.log(JSON.stringify({
    generatedAt: report.generatedAt,
    totalCountries: report.totalCountries,
    updatedCountries: report.updatedCountries,
    countriesWithWarnings: report.countriesWithWarnings
  }, null, 2));
}

main().catch(async (error) => {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.writeFile(
    REPORT_PATH,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "failed",
      error: String(error?.message || error)
    }, null, 2)}\n`,
    "utf-8"
  );
  console.error(error);
  process.exitCode = 1;
});
