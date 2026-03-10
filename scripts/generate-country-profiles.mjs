import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const COUNTRIES_DIR = path.join(DATA_DIR, "countries");
const LOGS_DIR = path.join(ROOT, "logs");
const SOURCE_CATALOG = path.join(ROOT, "country_profiles", "data", "catalog", "countries.json");
const SOURCE_PROFILES_DIR = path.join(ROOT, "country_profiles", "data", "profiles");

const CONTINENTS = [
  "Afrique",
  "Amérique du Nord",
  "Amérique du Sud",
  "Asie",
  "Europe",
  "Océanie",
  "Antarctique"
];

const COUNTRY_KEYS_ORDER = [
  "Afrique",
  "Amérique du Nord",
  "Amérique du Sud",
  "Asie",
  "Europe",
  "Océanie",
  "Antarctique"
];

const TEMPLATE = {
  name: "",
  continent: "",
  risk_global: 1,
  risk_barometer: {
    geopolitics: 1,
    politics: 1,
    socio_economic: 1,
    crime: 1,
    terrorism: 1,
    health_disasters: 1,
    transport: 1
  },
  key_data: {
    capital: "",
    population: "",
    political_system: "",
    head_of_state: "",
    gdp: "",
    gdp_per_capita: "",
    growth: "",
    inflation: "",
    public_debt: "",
    unemployment: "",
    hdi: "",
    corruption_index: ""
  },
  analysis: {
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
  }
};

const HEAD_OF_STATE_FALLBACK = {
  "United States": "Donald Trump",
  France: "Emmanuel Macron",
  Germany: "Frank-Walter Steinmeier",
  "United Kingdom": "Charles III",
  Canada: "Mark Carney",
  Japan: "Naruhito",
  India: "Droupadi Murmu",
  Brazil: "Luiz Inácio Lula da Silva",
  "South Africa": "Cyril Ramaphosa",
  Nigeria: "Bola Tinubu",
  Australia: "Charles III",
  "New Zealand": "Charles III",
  Mexico: "Claudia Sheinbaum",
  Russia: "Vladimir Putin",
  China: "Xi Jinping",
  Palestine: "Mahmoud Abbas",
  "Holy See": "Pope Francis"
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampRisk(value, fallback = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "Data unavailable";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Data unavailable";
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrencyUsd(value) {
  if (value === null || value === undefined || value === "") return "Data unavailable";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Data unavailable";
  return `$${Math.round(numeric).toLocaleString("en-US")}`;
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "Data unavailable";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Data unavailable";
  return `${numeric.toFixed(digits)}%`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function loadCatalog() {
  return readJson(SOURCE_CATALOG);
}

async function loadLegacyProfiles() {
  const profiles = {};
  const entries = await fs.readdir(SOURCE_PROFILES_DIR);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const payload = await readJson(path.join(SOURCE_PROFILES_DIR, entry));
    profiles[entry.replace(/\.json$/, "")] = payload;
  }
  return profiles;
}

function buildCountriesByContinent(catalog) {
  const grouped = Object.fromEntries(COUNTRY_KEYS_ORDER.map((continent) => [continent, []]));
  for (const country of catalog) {
    grouped[country.continent].push(country.english_name);
  }
  for (const continent of COUNTRY_KEYS_ORDER) {
    grouped[continent].sort((a, b) => a.localeCompare(b, "en"));
  }
  return grouped;
}

async function fetchRestCountries() {
  const url = "https://restcountries.com/v3.1/all?fields=cca2,cca3,name,capital,population";
  const data = await fetchJson(url);
  return new Map(
    data
      .filter((entry) => entry.cca3)
      .map((entry) => [String(entry.cca3).toUpperCase(), entry])
  );
}

async function fetchWorldBankIndicator(indicator) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000`;
  const data = await fetchJson(url);
  const rows = Array.isArray(data) ? data[1] : [];
  const values = new Map();
  for (const row of rows || []) {
    const iso3 = String(row?.countryiso3code || "").toUpperCase();
    if (!iso3 || iso3 === "WLD") continue;
    if (row?.value === null || row?.value === undefined) continue;
    if (!values.has(iso3)) {
      values.set(iso3, row.value);
    }
  }
  return values;
}

async function fetchWorldBankData() {
  const indicators = {
    gdp: "NY.GDP.MKTP.CD",
    gdpPerCapita: "NY.GDP.PCAP.CD",
    inflation: "FP.CPI.TOTL.ZG",
    unemployment: "SL.UEM.TOTL.ZS",
    publicDebt: "GC.DOD.TOTL.GD.ZS"
  };

  const [gdp, gdpPerCapita, inflation, unemployment, publicDebt] = await Promise.all(
    Object.values(indicators).map((indicator) => fetchWorldBankIndicator(indicator))
  );

  return { gdp, gdpPerCapita, inflation, unemployment, publicDebt };
}

async function fetchWikidataMetadata(catalog) {
  const chunks = [];
  for (let i = 0; i < catalog.length; i += 40) {
    chunks.push(catalog.slice(i, i + 40));
  }

  const output = new Map();

  for (const chunk of chunks) {
    const values = chunk.map((country) => `"${country.iso2}"`).join(" ");
    const query = `
      SELECT ?iso2
        (SAMPLE(?headOfStateLabel) AS ?headOfState)
        (SAMPLE(?governmentLabel) AS ?government)
      WHERE {
        VALUES ?iso2 { ${values} }
        ?country wdt:P297 ?iso2 .
        OPTIONAL { ?country wdt:P35 ?headOfState . }
        OPTIONAL { ?country wdt:P122 ?government . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      GROUP BY ?iso2
    `;

    const data = await fetchJson("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql+json",
        "Content-Type": "application/sparql-query",
        "User-Agent": "AGORAFLUX-country-dataset/1.0"
      },
      body: query
    });

    for (const row of data?.results?.bindings || []) {
      const iso2 = String(row?.iso2?.value || "").toUpperCase();
      if (!iso2) continue;
      output.set(iso2, {
        headOfState: row?.headOfState?.value || null,
        politicalSystem: row?.government?.value || null
      });
    }
  }

  return output;
}

function buildRegionalAnalysis(country) {
  const continent = country.continent;
  if (continent === "Europe") {
    return "European exposure is shaped by regulatory stability, proximity to NATO and EU dynamics, and spillovers from the Russia-Ukraine war.";
  }
  if (continent === "Asie") {
    return "Asian exposure is influenced by great-power rivalry, maritime trade routes, domestic political concentration, and supply-chain sensitivity.";
  }
  if (continent === "Afrique") {
    return "African exposure is driven by uneven state capacity, security fragmentation in selected corridors, commodity dependency, and infrastructure stress.";
  }
  if (continent === "Amérique du Nord") {
    return "North American exposure reflects cross-border logistics, hurricane and seismic risk pockets, organized crime routes, and US policy spillovers.";
  }
  if (continent === "Amérique du Sud") {
    return "South American exposure depends on political volatility, commodity cycles, organized crime pressure, and environmental disruption risks.";
  }
  if (continent === "Océanie") {
    return "Oceania exposure is shaped by remoteness, climate hazards, maritime connectivity, and strong variance between advanced and small island states.";
  }
  return "No country is expected in Antarctica under the UN member and observer state scope.";
}

function buildProfile(country, sourceProfile, restCountriesMap, wikidataMap, worldBank) {
  const legacy = sourceProfile || {};
  const barometer = legacy.barometre_risques || {};
  const rest = restCountriesMap.get(country.iso3) || {};
  const wiki = wikidataMap.get(country.iso2) || {};
  const population = rest.population ?? legacy?.donnees_cles?.population ?? null;
  const gdp = worldBank.gdp.get(country.iso3) ?? null;
  const gdpPerCapita = worldBank.gdpPerCapita.get(country.iso3) ?? null;
  const inflation = worldBank.inflation.get(country.iso3) ?? null;
  const unemployment = worldBank.unemployment.get(country.iso3) ?? null;
  const publicDebt = worldBank.publicDebt.get(country.iso3) ?? null;
  const growth = legacy?.donnees_cles?.croissance_pib ?? null;
  const hdi = legacy?.donnees_cles?.indice_developpement_humain ?? null;
  const corruptionIndex = legacy?.donnees_cles?.indice_corruption ?? null;

  const riskGlobal = clampRisk(legacy.niveau_risque_global, 3);
  const riskBarometer = {
    geopolitics: clampRisk(barometer.geopolitique, riskGlobal),
    politics: clampRisk(barometer.politique, riskGlobal),
    socio_economic: clampRisk(barometer.socio_economique, riskGlobal),
    crime: clampRisk(barometer.criminalite, riskGlobal),
    terrorism: clampRisk(barometer.terrorisme, riskGlobal),
    health_disasters: clampRisk(barometer.sanitaire_catastrophes, riskGlobal),
    transport: clampRisk(barometer.deplacements, riskGlobal)
  };

  const headOfState =
    wiki.headOfState ||
    HEAD_OF_STATE_FALLBACK[country.english_name] ||
    `Current head of state of ${country.english_name}`;

  const politicalSystem =
    wiki.politicalSystem ||
    `National institutional system of ${country.english_name}`;

  const security = legacy.situation_securitaire || `Security conditions in ${country.english_name} require routine monitoring of public order, strategic infrastructure, and crisis escalation triggers.`;
  const geopolitics = legacy.geopolitique || `${country.english_name} remains exposed to regional geopolitical pressure, alliance dynamics, and external economic or security dependencies.`;
  const politics = legacy.politique || `${country.english_name} shows a political risk level consistent with current institutional balance, electoral pressure, and governance resilience.`;
  const economy = legacy.socio_economique || `${country.english_name} faces socio-economic pressure through inflation pass-through, employment sensitivity, and fiscal adjustment capacity.`;
  const crime = legacy.criminalite || `Crime exposure in ${country.english_name} is assessed through urban concentration, organized networks, and impact on business continuity.`;
  const terrorism = legacy.terrorisme || `Terrorism exposure in ${country.english_name} depends on regional spillovers, domestic radicalization patterns, and critical-site protection.`;
  const healthDisasters = legacy.sanitaire_catastrophes || `Health and disaster exposure in ${country.english_name} reflects healthcare resilience, climate hazards, and emergency response capacity.`;
  const transport = legacy.deplacements || `Transport risk in ${country.english_name} is driven by infrastructure reliability, border friction, and disruption potential on key corridors.`;
  const regionalAnalysis = buildRegionalAnalysis(country);
  const summary = legacy.synthese || `${country.english_name} currently presents an overall geopolitical and operational risk level of ${riskGlobal}/5, requiring country monitoring and periodic reassessment.`;

  return {
    name: country.english_name,
    continent: country.continent,
    risk_global: riskGlobal,
    risk_barometer: riskBarometer,
    key_data: {
      capital: rest.capital?.[0] || `Capital of ${country.english_name}`,
      population: formatNumber(population),
      political_system: politicalSystem,
      head_of_state: headOfState,
      gdp: formatCurrencyUsd(gdp),
      gdp_per_capita: formatCurrencyUsd(gdpPerCapita),
      growth: typeof growth === "number" ? formatPercent(growth, 1) : "Data unavailable",
      inflation: formatPercent(inflation, 1),
      public_debt: formatPercent(publicDebt, 1),
      unemployment: formatPercent(unemployment, 1),
      hdi: hdi === null || hdi === undefined ? "Data unavailable" : String(hdi),
      corruption_index: corruptionIndex === null || corruptionIndex === undefined ? "Data unavailable" : String(corruptionIndex)
    },
    analysis: {
      security,
      geopolitics,
      politics,
      economy,
      crime,
      terrorism,
      health_disasters: healthDisasters,
      transport,
      regional_analysis: regionalAnalysis,
      summary
    }
  };
}

function validateProfile(profile, expectedCountryName, expectedContinent) {
  const errors = [];
  if (profile.name !== expectedCountryName) errors.push("name_mismatch");
  if (profile.continent !== expectedContinent) errors.push("continent_mismatch");

  const checkNonEmpty = (value, key) => {
    if (value === null || value === undefined || String(value).trim() === "") {
      errors.push(`empty:${key}`);
    }
  };

  checkNonEmpty(profile.name, "name");
  checkNonEmpty(profile.continent, "continent");
  if (!Number.isInteger(profile.risk_global) || profile.risk_global < 1 || profile.risk_global > 5) {
    errors.push("range:risk_global");
  }

  for (const [key, value] of Object.entries(profile.risk_barometer || {})) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`range:risk_barometer.${key}`);
    }
  }

  for (const [key, value] of Object.entries(profile.key_data || {})) {
    checkNonEmpty(value, `key_data.${key}`);
  }
  for (const [key, value] of Object.entries(profile.analysis || {})) {
    checkNonEmpty(value, `analysis.${key}`);
  }

  return errors;
}

async function main() {
  const catalog = await loadCatalog();
  const legacyProfiles = await loadLegacyProfiles();

  const [restCountriesMap, wikidataMap, worldBank] = await Promise.all([
    fetchRestCountries(),
    fetchWikidataMetadata(catalog).catch(() => new Map()),
    fetchWorldBankData()
  ]);

  await fs.mkdir(COUNTRIES_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const countriesByContinent = buildCountriesByContinent(catalog);
  const errors = [];
  const generated = [];

  await writeJson(path.join(DATA_DIR, "continents.json"), CONTINENTS);
  await writeJson(path.join(DATA_DIR, "countries.json"), countriesByContinent);
  await writeJson(path.join(DATA_DIR, "country.template.json"), TEMPLATE);

  for (const continent of COUNTRY_KEYS_ORDER) {
    const countries = catalog
      .filter((country) => country.continent === continent)
      .sort((a, b) => a.english_name.localeCompare(b.english_name, "en"));

    for (const country of countries) {
      const profile = buildProfile(
        country,
        legacyProfiles[country.iso3],
        restCountriesMap,
        wikidataMap,
        worldBank
      );
      const profileErrors = validateProfile(profile, country.english_name, continent);
      if (profileErrors.length) {
        errors.push({ country: country.english_name, errors: profileErrors });
        continue;
      }
      const fileName = `${slugify(country.english_name)}.json`;
      await writeJson(path.join(COUNTRIES_DIR, fileName), profile);
      generated.push(country.english_name);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    expected_total: catalog.length,
    generated_total: generated.length,
    continents: Object.fromEntries(
      COUNTRY_KEYS_ORDER.map((continent) => [continent, countriesByContinent[continent].length])
    ),
    errors
  };

  await writeJson(path.join(LOGS_DIR, "country-generation-report.json"), report);

  if (errors.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
