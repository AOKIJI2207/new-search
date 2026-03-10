import fs from "node:fs/promises";
import path from "node:path";
import {
  flattenCountries,
  loadCountryProfileBySlug,
  slugify,
  writeCountryProfileBySlug
} from "../server/country-store.js";

const ROOT = process.cwd();
const LOGS_DIR = path.join(ROOT, "logs");
const REPORT_PATH = path.join(LOGS_DIR, "update-country-data-report.json");
const REQUEST_TIMEOUT_MS = 6000;

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
    const value = Number(seriesNode[year]);
    if (Number.isFinite(value)) {
      return { value, year, source: "IMF" };
    }
  }
  return null;
}

async function fetchUnDataHdi(iso3) {
  if (!iso3) return null;
  const url = `https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?seriesCode=HDI&areaCode=${encodeURIComponent(iso3)}`;
  const payload = await fetchJson(url);
  const rows = payload?.data;
  if (!Array.isArray(rows)) return null;
  const hit = rows.find((item) => item?.value !== null && item?.value !== undefined);
  if (!hit) return null;
  const numeric = Number(hit.value);
  if (!Number.isFinite(numeric)) return null;
  return {
    value: numeric,
    year: String(hit.timePeriodStart || hit.timePeriod || ""),
    source: "UN Data"
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

function applyIndicator(profile, field, indicator) {
  if (!indicator || !Number.isFinite(indicator.value)) {
    return profile;
  }

  const next = structuredClone(profile);
  switch (field) {
    case "population":
      next.key_data.population = formatInteger(indicator.value);
      break;
    case "gdp":
      next.key_data.gdp = formatCurrency(indicator.value);
      break;
    case "gdp_per_capita":
      next.key_data.gdp_per_capita = formatCurrency(indicator.value);
      break;
    case "growth":
      next.key_data.growth = formatPercent(indicator.value);
      break;
    case "inflation":
      next.key_data.inflation = formatPercent(indicator.value);
      break;
    case "unemployment":
      next.key_data.unemployment = formatPercent(indicator.value);
      break;
    case "hdi":
      next.key_data.hdi = formatHdi(indicator.value);
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

  let next = structuredClone(profile);
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
