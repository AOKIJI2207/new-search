import fs from "node:fs/promises";
import path from "node:path";
import { flattenCountries, loadContinents, loadCountryProfileBySlug, slugify } from "../server/country-store.js";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "logs", "validate-dataset-report.json");
const ALLOWED_CONTINENTS = new Set(loadContinents());

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function validateProfileShape(profile, expectedName, expectedContinent) {
  const errors = [];
  const requiredRoot = ["name", "continent", "risk_global", "risk_barometer", "key_data", "analysis", "risk_breakdown"];
  const requiredBarometer = ["geopolitics", "politics", "socio_economic", "crime", "terrorism", "health_disasters", "transport"];
  const requiredKeyData = ["capital", "population", "political_system", "head_of_state", "gdp", "gdp_per_capita", "growth", "inflation", "public_debt", "unemployment", "hdi", "corruption_index"];
  const requiredAnalysis = ["security", "geopolitics", "politics", "economy", "crime", "terrorism", "health_disasters", "transport", "regional_analysis", "summary"];
  const requiredSupplemental = ["political_stability", "conflict_risk", "terrorism_risk", "military_expenditure"];
  const requiredRiskBreakdown = ["political", "economic", "social", "fiscal"];

  for (const key of requiredRoot) {
    if (!(key in profile)) errors.push(`missing:${key}`);
  }

  if (profile.name !== expectedName) errors.push("name_mismatch");
  if (profile.continent !== expectedContinent) errors.push("continent_mismatch");
  if (!ALLOWED_CONTINENTS.has(profile.continent)) errors.push("invalid_continent");
  if (!Number.isInteger(profile.risk_global) || profile.risk_global < 1 || profile.risk_global > 5) {
    errors.push("range:risk_global");
  }

  for (const key of requiredBarometer) {
    const value = profile.risk_barometer?.[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`range:risk_barometer.${key}`);
    }
  }

  for (const key of requiredKeyData) {
    if (isBlank(profile.key_data?.[key])) {
      errors.push(`empty:key_data.${key}`);
    }
  }

  for (const key of requiredAnalysis) {
    if (isBlank(profile.analysis?.[key])) {
      errors.push(`empty:analysis.${key}`);
    }
  }

  if ("intelligence_indicators" in profile) {
    for (const key of requiredSupplemental) {
      if (!(key in profile.intelligence_indicators)) {
        errors.push(`missing:intelligence_indicators.${key}`);
      }
    }
  }

  if ("risk_breakdown" in profile) {
    for (const key of requiredRiskBreakdown) {
      if (!(key in profile.risk_breakdown)) {
        errors.push(`missing:risk_breakdown.${key}`);
      }
    }
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

    const errors = validateProfileShape(profile, entry.name, entry.continent);
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
