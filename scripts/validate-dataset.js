import fs from "node:fs/promises";
import path from "node:path";
import { flattenCountries, loadContinents, loadCountryProfileBySlug, slugify } from "../server/country-store.js";
import { TRUSTED_NEWS_PUBLISHERS, validateCountryMetric } from "../shared/country-profile.js";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "logs", "validate-dataset-report.json");
const ALLOWED_CONTINENTS = new Set(loadContinents());
const REQUIRED_METRICS = ["population", "gdp", "gdpPerCapita", "growth", "inflation", "unemployment", "hdi"];
const REQUIRED_RISK_BAROMETER = ["geopolitics", "politics", "socio_economic", "crime", "terrorism", "health_disasters", "transport"];

function isMissing(value) {
  return value === undefined;
}

function isIsoDate(value) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function validateSourceEntry(entry, errors) {
  if (!entry || typeof entry !== "object") {
    errors.push("invalid:sources.entry");
    return;
  }
  if (!entry.label) errors.push("missing:sources.label");
  if (!entry.referenceLabel) errors.push("missing:sources.referenceLabel");
  if (!entry.url) errors.push("missing:sources.url");
  if (!Array.isArray(entry.fields)) errors.push("invalid:sources.fields");
  if (entry.updatedAt && !isIsoDate(entry.updatedAt)) errors.push("invalid:sources.updatedAt");
}

function validateNewsEntry(entry, errors) {
  if (!entry || typeof entry !== "object") {
    errors.push("invalid:news.entry");
    return;
  }
  if (!entry.title) errors.push("missing:news.title");
  if (!entry.url) errors.push("missing:news.url");
  if (entry.publishedAt && !isIsoDate(entry.publishedAt)) errors.push("invalid:news.publishedAt");
  if (entry.publisher && !TRUSTED_NEWS_PUBLISHERS.has(entry.publisher) && !/(\.org|AP News|Reuters|BBC|Bloomberg|Economist|Financial Times)/i.test(entry.publisher)) {
    errors.push(`untrusted:news.publisher:${entry.publisher}`);
  }
}

function validateProfileShape(profile, expectedEntry) {
  const errors = [];
  const requiredRoot = ["code", "slug", "name", "continent", "metrics", "sources", "news", "lastUpdated", "risk_global", "risk_barometer", "analysis"];

  for (const key of requiredRoot) {
    if (!(key in profile)) errors.push(`missing:${key}`);
  }

  if (profile.name !== expectedEntry.name) errors.push("name_mismatch");
  if (profile.slug !== expectedEntry.slug) errors.push("slug_mismatch");
  if (profile.code !== expectedEntry.iso3) errors.push("code_mismatch");
  if (profile.continent !== expectedEntry.continent) errors.push("continent_mismatch");
  if (!ALLOWED_CONTINENTS.has(profile.continent)) errors.push("invalid_continent");
  if (!isIsoDate(profile.lastUpdated)) errors.push("invalid:lastUpdated");

  if (!Number.isInteger(profile.risk_global) || profile.risk_global < 1 || profile.risk_global > 5) {
    errors.push("range:risk_global");
  }

  for (const key of REQUIRED_RISK_BAROMETER) {
    const value = profile.risk_barometer?.[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`range:risk_barometer.${key}`);
    }
  }

  for (const field of REQUIRED_METRICS) {
    if (isMissing(profile.metrics?.[field])) {
      errors.push(`missing:metrics.${field}`);
      continue;
    }

    const validated = validateCountryMetric(field, profile.metrics[field], { countryName: profile.name });
    if (profile.metrics[field] !== null && validated === null) {
      errors.push(`invalid:metrics.${field}`);
    }
  }

  if (!Array.isArray(profile.sources)) {
    errors.push("invalid:sources");
  } else {
    profile.sources.forEach((source) => validateSourceEntry(source, errors));
  }

  if (!Array.isArray(profile.news)) {
    errors.push("invalid:news");
  } else {
    profile.news.forEach((newsItem) => validateNewsEntry(newsItem, errors));
  }

  return errors;
}

async function main() {
  const countries = flattenCountries();
  const seen = new Set();
  const duplicates = [];
  const invalidContinents = [];
  const invalidProfiles = [];

  for (const entry of countries) {
    if (seen.has(entry.name)) {
      duplicates.push(entry.name);
    }
    seen.add(entry.name);

    if (!ALLOWED_CONTINENTS.has(entry.continent)) {
      invalidContinents.push(entry.continent);
    }

    const profile = loadCountryProfileBySlug(entry.slug);
    if (!profile) {
      invalidProfiles.push({ country: entry.name, errors: ["missing_file"] });
      continue;
    }

    const errors = validateProfileShape(profile, entry);
    if (errors.length) {
      invalidProfiles.push({ country: entry.name, errors });
    }
  }

  const files = await fs.readdir(path.join(ROOT, "data", "countries"));
  const expectedSlugs = new Set(countries.map((entry) => entry.slug));
  const unexpectedCountries = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((slug) => !expectedSlugs.has(slug))
    .sort();

  const report = {
    generated_at: new Date().toISOString(),
    total_expected: 195,
    total_found: countries.length,
    duplicates: [...new Set(duplicates)].sort(),
    missing_countries: countries.filter((entry) => !files.includes(`${slugify(entry.name)}.json`)).map((entry) => entry.name).sort(),
    unexpected_countries: unexpectedCountries,
    invalid_continents: [...new Set(invalidContinents)].sort(),
    invalid_profiles: invalidProfiles
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  const hasErrors =
    report.total_found !== report.total_expected ||
    report.duplicates.length > 0 ||
    report.missing_countries.length > 0 ||
    report.unexpected_countries.length > 0 ||
    report.invalid_continents.length > 0 ||
    report.invalid_profiles.length > 0;

  console.log(JSON.stringify(report, null, 2));
  if (hasErrors) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
