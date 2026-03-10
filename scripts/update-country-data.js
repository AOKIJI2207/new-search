import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  flattenCountries,
  loadCountryProfileBySlug,
  writeCountryProfileBySlug
} from "../server/country-store.js";
import {
  buildCountryLastUpdated,
  createEmptyCountryProfile,
  normalizeCountryNews,
  normalizeCountrySources,
  validateCountryMetric
} from "../shared/country-profile.js";
import { generateCountrySummary } from "../shared/country-formatting.js";

const ROOT = process.cwd();
const LOGS_DIR = path.join(ROOT, "logs");
const REPORT_PATH = path.join(LOGS_DIR, "update-country-data-report.json");
const REQUEST_TIMEOUT_MS = 8000;
const REFERENCE_DIR = path.join(ROOT, "data", "reference");
const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_CONFIRMED_IMF_YEAR = CURRENT_YEAR - 1;

const WORLD_BANK_INDICATORS = {
  population: "SP.POP.TOTL",
  gdp: "NY.GDP.MKTP.CD",
  gdpPerCapita: "NY.GDP.PCAP.CD",
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
  news: "country-news.json"
};

const REFERENCE_CACHE = new Map();

function withTimeout(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: withTimeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: withTimeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function readReferenceDataset(fileName) {
  if (REFERENCE_CACHE.has(fileName)) {
    return REFERENCE_CACHE.get(fileName);
  }

  const payload = JSON.parse(await fs.readFile(path.join(REFERENCE_DIR, fileName), "utf-8"));
  REFERENCE_CACHE.set(fileName, payload);
  return payload;
}

function stripTags(value = "") {
  return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function toIsoDate(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}$/.test(raw)) return `${raw}-12-31`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function pickLatestByCountry(records = []) {
  const latest = new Map();

  for (const item of records) {
    if (!item?.countryiso3code || item.countryiso3code === "WLD") {
      continue;
    }
    if (item.value === null || item.value === undefined || item.value === "") {
      continue;
    }

    const iso3 = item.countryiso3code;
    const year = Number(item.date || 0);
    const current = latest.get(iso3);
    if (!current || year > current.year) {
      latest.set(iso3, {
        value: Number(item.value),
        year: String(item.date || "")
      });
    }
  }

  return latest;
}

async function fetchWorldBankIndicatorMaps() {
  const entries = await Promise.all(
    Object.entries(WORLD_BANK_INDICATORS).map(async ([field, indicator]) => {
      const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&mrv=5`;
      const payload = await fetchJson(url);
      return [field, pickLatestByCountry(payload?.[1] || [])];
    })
  );

  return Object.fromEntries(entries);
}

async function fetchWorldBankCountryMetadataMap() {
  const payload = await fetchJson("https://api.worldbank.org/v2/country?format=json&per_page=400");
  const countries = payload?.[1] || [];
  const map = new Map();

  for (const country of countries) {
    if (!country?.id || !country?.iso2Code) {
      continue;
    }

    map.set(country.id, {
      iso2: country.iso2Code,
      capital: country.capitalCity || null,
      region: country.region?.value || null,
      incomeGroup: country.incomeLevel?.value || null
    });
  }

  return map;
}

async function fetchImfValue(iso3, series) {
  if (!iso3) return null;
  const url = `https://www.imf.org/external/datamapper/api/v1/${series}/${encodeURIComponent(iso3)}`;
  const payload = await fetchJson(url);
  const seriesNode = payload?.values?.[series]?.[iso3];
  if (!seriesNode || typeof seriesNode !== "object") return null;
  const years = Object.keys(seriesNode).sort((left, right) => Number(right) - Number(left));

  for (const year of years) {
    if (Number(year) > MAX_CONFIRMED_IMF_YEAR) {
      continue;
    }
    const value = Number(seriesNode[year]);
    if (Number.isFinite(value)) {
      return { value, updatedAt: `${year}-12-31`, sourceId: "imf" };
    }
  }

  return null;
}

async function fetchHdiMap() {
  const dataset = await readReferenceDataset(REFERENCE_FILES.hdi);
  const map = new Map();

  for (const [iso3, value] of Object.entries(dataset || {})) {
    map.set(iso3, {
      value: Number(value?.value),
      updatedAt: toIsoDate(value?.year || ""),
      sourceId: "undp"
    });
  }

  return map;
}

async function fetchCurrencyMap() {
  const html = await fetchText("https://wits.worldbank.org/CountryProfile/Metadata/en/Country/All");
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const map = new Map();

  for (const [, rowHtml] of rows) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripTags(match[1]));
    if (cells.length < 8) {
      continue;
    }

    const [countryName, iso3, _numericCode, _formalName, _incomeGroup, _lendingCategory, _region, currency] = cells;
    if (!iso3 || iso3.length !== 3 || iso3 === "ISO3") {
      continue;
    }

    const normalizedCurrency = currency && currency !== "-" ? currency : null;
    map.set(iso3.toUpperCase(), {
      countryName,
      currency: normalizedCurrency,
      sourceId: "worldBankWits"
    });
  }

  return map;
}

async function fetchNewsByCountry() {
  const dataset = await readReferenceDataset(REFERENCE_FILES.news);
  const byCountry = new Map();

  for (const article of dataset || []) {
    const countries = Array.isArray(article.countries) ? article.countries : [];
    for (const slug of countries) {
      if (!byCountry.has(slug)) {
        byCountry.set(slug, []);
      }
      byCountry.get(slug).push(article);
    }
  }

  for (const [slug, articles] of byCountry.entries()) {
    byCountry.set(slug, normalizeCountryNews(articles));
  }

  return byCountry;
}

function normalizeMetric(countryName, field, value) {
  return validateCountryMetric(field, value, { countryName, warn: true });
}

function buildProfile({ entry, existingProfile, worldBankIndicators, worldBankCountries, hdiByIso3, currencyByIso3, newsByCountry }) {
  const next = createEmptyCountryProfile({
    code: entry.iso3,
    slug: entry.slug,
    name: entry.name,
    continent: entry.continent
  });
  const sourceEntries = [];

  const worldBankCountry = worldBankCountries.get(entry.iso3) || {};
  if (worldBankCountry.region) {
    next.region = worldBankCountry.region;
    sourceEntries.push({ sourceId: "worldBankCountry", fields: ["region"] });
  }
  if (worldBankCountry.incomeGroup) {
    next.incomeGroup = worldBankCountry.incomeGroup;
    sourceEntries.push({ sourceId: "worldBankCountry", fields: ["incomeGroup"] });
  }
  if (worldBankCountry.capital) {
    next.capital = worldBankCountry.capital;
    sourceEntries.push({ sourceId: "worldBankCountry", fields: ["capital"] });
  }

  const currency = currencyByIso3.get(entry.iso3)?.currency || null;
  if (currency) {
    next.currency = currency;
    sourceEntries.push({ sourceId: "worldBankWits", fields: ["currency"] });
  }

  for (const field of Object.keys(WORLD_BANK_INDICATORS)) {
    const indicator = worldBankIndicators[field]?.get(entry.iso3);
    if (!indicator) {
      continue;
    }

    const value = normalizeMetric(entry.name, field, indicator.value);
    if (value === null) {
      continue;
    }

    next.metrics[field] = value;
    sourceEntries.push({
      sourceId: "worldBank",
      fields: [field],
      updatedAt: toIsoDate(indicator.year)
    });
  }

  const hdi = hdiByIso3.get(entry.iso3);
  if (hdi) {
    const value = normalizeMetric(entry.name, "hdi", hdi.value);
    if (value !== null) {
      next.metrics.hdi = value;
      sourceEntries.push({
        sourceId: "undp",
        fields: ["hdi"],
        updatedAt: hdi.updatedAt
      });
    }
  }

  next.sources = normalizeCountrySources(sourceEntries);
  next.sourceEntries = sourceEntries;
  next.news = newsByCountry.get(entry.slug) || [];
  next.lastUpdated = buildCountryLastUpdated(next.sources, new Date().toISOString().slice(0, 10));

  next.risk_global = existingProfile?.risk_global ?? 3;
  next.risk_barometer = existingProfile?.risk_barometer || {
    geopolitics: 3,
    politics: 3,
    socio_economic: 3,
    crime: 3,
    terrorism: 3,
    health_disasters: 3,
    transport: 3
  };
  next.analysis = existingProfile?.analysis || {
    security: "",
    geopolitics: "",
    politics: "",
    economy: "",
    crime: "",
    terrorism: "",
    health_disasters: "",
    transport: "",
    regional_analysis: "",
    summary: ""
  };
  next.analysis.summary = generateCountrySummary(next);

  return next;
}

async function backfillImfFallbacks(profile, entry, updates, warnings) {
  for (const [field, series] of Object.entries(IMF_SERIES)) {
    if (profile.metrics[field] !== null) {
      continue;
    }

    try {
      const fallback = await fetchImfValue(entry.iso3, series);
      if (!fallback) {
        continue;
      }

      const value = normalizeMetric(entry.name, field, fallback.value);
      if (value === null) {
        continue;
      }

      profile.metrics[field] = value;
      profile.sourceEntries.push({ sourceId: "imf", fields: [field], updatedAt: fallback.updatedAt });
      profile.sources = normalizeCountrySources(profile.sourceEntries);
      updates.push({ field, source: "IMF", updatedAt: fallback.updatedAt });
    } catch (error) {
      warnings.push(String(error?.message || error));
    }
  }

  profile.lastUpdated = buildCountryLastUpdated(profile.sources, profile.lastUpdated);
  profile.analysis.summary = generateCountrySummary(profile);
}

async function updateCountry(entry, context) {
  const existingProfile = loadCountryProfileBySlug(entry.slug);
  const warnings = [];
  const updates = [];

  try {
    const next = buildProfile({
      entry,
      existingProfile,
      worldBankIndicators: context.worldBankIndicators,
      worldBankCountries: context.worldBankCountries,
      hdiByIso3: context.hdiByIso3,
      currencyByIso3: context.currencyByIso3,
      newsByCountry: context.newsByCountry
    });

    await backfillImfFallbacks(next, entry, updates, warnings);
    delete next.sourceEntries;
    writeCountryProfileBySlug(entry.slug, next);

    for (const source of next.sources) {
      for (const field of source.fields) {
        updates.push({ field, source: source.label, updatedAt: source.updatedAt || "" });
      }
    }

    return {
      country: entry.name,
      slug: entry.slug,
      status: "updated",
      updates,
      warnings: [...new Set(warnings)]
    };
  } catch (error) {
    return {
      country: entry.name,
      slug: entry.slug,
      status: "failed",
      updates,
      warnings: [String(error?.message || error)]
    };
  }
}

async function main() {
  const countries = flattenCountries();
  const [
    worldBankIndicatorsResult,
    worldBankCountriesResult,
    hdiByIso3Result,
    currencyByIso3Result,
    newsByCountryResult
  ] = await Promise.allSettled([
    fetchWorldBankIndicatorMaps(),
    fetchWorldBankCountryMetadataMap(),
    fetchHdiMap(),
    fetchCurrencyMap(),
    fetchNewsByCountry()
  ]);

  const worldBankIndicators = worldBankIndicatorsResult.status === "fulfilled" ? worldBankIndicatorsResult.value : {};
  const worldBankCountries = worldBankCountriesResult.status === "fulfilled" ? worldBankCountriesResult.value : new Map();
  const hdiByIso3 = hdiByIso3Result.status === "fulfilled" ? hdiByIso3Result.value : new Map();
  const currencyByIso3 = currencyByIso3Result.status === "fulfilled" ? currencyByIso3Result.value : new Map();
  const newsByCountry = newsByCountryResult.status === "fulfilled" ? newsByCountryResult.value : new Map();

  const context = {
    worldBankIndicators,
    worldBankCountries,
    hdiByIso3,
    currencyByIso3,
    newsByCountry
  };

  const results = [];
  const batchSize = 12;

  for (let index = 0; index < countries.length; index += batchSize) {
    const batch = countries.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((entry) => updateCountry(entry, context)));
    results.push(...batchResults);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalCountries: countries.length,
    updatedCountries: results.filter((item) => item.status === "updated").length,
    failedCountries: results.filter((item) => item.status === "failed").length,
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
    failedCountries: report.failedCountries,
    countriesWithWarnings: report.countriesWithWarnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
