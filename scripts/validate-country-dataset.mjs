import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const COUNTRIES_JSON = path.join(DATA_DIR, "countries.json");
const CONTINENTS_JSON = path.join(DATA_DIR, "continents.json");
const COUNTRY_FILES_DIR = path.join(DATA_DIR, "countries");
const REPORT_PATH = path.join(ROOT, "logs", "country-validation-report.json");
const SOURCE_CATALOG = path.join(ROOT, "country_profiles", "data", "catalog", "countries.json");

const ALLOWED_CONTINENTS = [
  "Afrique",
  "Amérique du Nord",
  "Amérique du Sud",
  "Asie",
  "Europe",
  "Océanie",
  "Antarctique"
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function validateProfileShape(profile, expectedName, expectedContinent) {
  const errors = [];
  const requiredRoot = ["name", "continent", "risk_global", "risk_barometer", "key_data", "analysis"];
  const requiredBarometer = ["geopolitics", "politics", "socio_economic", "crime", "terrorism", "health_disasters", "transport"];
  const requiredKeyData = ["capital", "population", "political_system", "head_of_state", "gdp", "gdp_per_capita", "growth", "inflation", "public_debt", "unemployment", "hdi", "corruption_index"];
  const requiredAnalysis = ["security", "geopolitics", "politics", "economy", "crime", "terrorism", "health_disasters", "transport", "regional_analysis", "summary"];

  for (const key of requiredRoot) {
    if (!(key in profile)) errors.push(`missing:${key}`);
  }
  if (profile.name !== expectedName) errors.push("name_mismatch");
  if (profile.continent !== expectedContinent) errors.push("continent_mismatch");
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
    const value = profile.key_data?.[key];
    if (value === null || value === undefined || String(value).trim() === "") {
      errors.push(`empty:key_data.${key}`);
    }
  }

  for (const key of requiredAnalysis) {
    const value = profile.analysis?.[key];
    if (value === null || value === undefined || String(value).trim() === "") {
      errors.push(`empty:analysis.${key}`);
    }
  }

  return errors;
}

async function main() {
  const [continents, countriesByContinent, sourceCatalog] = await Promise.all([
    readJson(CONTINENTS_JSON),
    readJson(COUNTRIES_JSON),
    readJson(SOURCE_CATALOG)
  ]);

  const invalidContinents = continents.filter((continent) => !ALLOWED_CONTINENTS.includes(continent));
  const countryEntries = [];
  for (const continent of Object.keys(countriesByContinent)) {
    if (!ALLOWED_CONTINENTS.includes(continent)) invalidContinents.push(continent);
    for (const country of countriesByContinent[continent] || []) {
      countryEntries.push({ name: country, continent });
    }
  }

  const duplicates = [];
  const seen = new Set();
  for (const entry of countryEntries) {
    const key = entry.name;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }

  const expectedCountries = sourceCatalog.map((country) => ({
    name: country.english_name,
    continent: country.continent
  }));
  const expectedNames = new Set(expectedCountries.map((country) => country.name));
  const foundNames = new Set(countryEntries.map((country) => country.name));

  const missingCountries = expectedCountries
    .filter((country) => !foundNames.has(country.name))
    .map((country) => country.name);

  const unexpectedCountries = countryEntries
    .filter((country) => !expectedNames.has(country.name))
    .map((country) => country.name);

  const invalidProfiles = [];
  const files = await fs.readdir(COUNTRY_FILES_DIR);
  const fileSet = new Set(files);

  for (const country of expectedCountries) {
    const fileName = `${slugify(country.name)}.json`;
    if (!fileSet.has(fileName)) {
      invalidProfiles.push({ country: country.name, errors: ["missing_file"] });
      continue;
    }
    const profile = await readJson(path.join(COUNTRY_FILES_DIR, fileName));
    const errors = validateProfileShape(profile, country.name, country.continent);
    if (errors.length) {
      invalidProfiles.push({ country: country.name, errors });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_expected: expectedCountries.length,
    total_found: countryEntries.length,
    duplicates: [...new Set(duplicates)].sort(),
    missing_countries: missingCountries.sort(),
    unexpected_countries: [...new Set(unexpectedCountries)].sort(),
    invalid_continents: [...new Set(invalidContinents)].sort(),
    invalid_profiles: invalidProfiles
  };

  await writeJson(REPORT_PATH, report);

  const hasErrors =
    report.total_expected !== report.total_found ||
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
