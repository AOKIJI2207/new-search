import fs from "fs/promises";
import path from "path";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "agoraflux-country-profiles/1.0";
const CACHE_FILE = path.join(process.cwd(), "assets", "country-profiles-cache.json");
const COUNTRIES_INDEX_FILE = path.join(process.cwd(), "assets", "countries.json");

let memoryCache = null;
let countriesIndexCache = null;

const CONTINENT_THRESHOLDS = {
  Europe: 40,
  Afrique: 50,
  Asie: 40,
  "Amérique du Nord": 20,
  "Amérique du Sud": 10,
  Océanie: 10
};

const LEADER_PARTY_FALLBACK = {
  Nigeria: { headOfState: "Bola Tinubu", rulingParty: "All Progressives Congress" },
  "South Africa": { headOfState: "Cyril Ramaphosa", rulingParty: "African National Congress" },
  Kenya: { headOfState: "William Ruto", rulingParty: "United Democratic Alliance" },
  Egypt: { headOfState: "Abdel Fattah al-Sissi", rulingParty: "Nation's Future Party" },
  Morocco: { headOfState: "Mohammed VI", rulingParty: "Rassemblement national des indépendants" },
  Ghana: { headOfState: "Nana Akufo-Addo", rulingParty: "New Patriotic Party" },
  Senegal: { headOfState: "Bassirou Diomaye Faye", rulingParty: "Pastef" },
  "United States": { headOfState: "Donald Trump", rulingParty: "Parti républicain" },
  Canada: { headOfState: "Mark Carney", rulingParty: "Parti libéral du Canada" },
  Mexico: { headOfState: "Claudia Sheinbaum", rulingParty: "Morena" },
  Brazil: { headOfState: "Luiz Inácio Lula da Silva", rulingParty: "Parti des travailleurs" },
  Argentina: { headOfState: "Javier Milei", rulingParty: "La Libertad Avanza" },
  Colombia: { headOfState: "Gustavo Petro", rulingParty: "Pacto Histórico" },
  Chile: { headOfState: "Gabriel Boric", rulingParty: "Convergencia Social" },
  Peru: { headOfState: "Dina Boluarte", rulingParty: "Gouvernement sans majorité parlementaire" },
  China: { headOfState: "Xi Jinping", rulingParty: "Parti communiste chinois" },
  India: { headOfState: "Droupadi Murmu", rulingParty: "Bharatiya Janata Party" },
  Japan: { headOfState: "Naruhito", rulingParty: "Parti libéral-démocrate" },
  "South Korea": { headOfState: "Yoon Suk Yeol", rulingParty: "People Power Party" },
  Indonesia: { headOfState: "Prabowo Subianto", rulingParty: "Coalition Indonésie avancée" },
  Pakistan: { headOfState: "Asif Ali Zardari", rulingParty: "Pakistan Muslim League (N)" },
  France: { headOfState: "Emmanuel Macron", rulingParty: "Renaissance" },
  Germany: { headOfState: "Frank-Walter Steinmeier", rulingParty: "SPD" },
  "United Kingdom": { headOfState: "Charles III", rulingParty: "Labour Party" },
  Italy: { headOfState: "Sergio Mattarella", rulingParty: "Fratelli d'Italia" },
  Spain: { headOfState: "Felipe VI", rulingParty: "PSOE" },
  Ukraine: { headOfState: "Volodymyr Zelensky", rulingParty: "Serviteur du peuple" },
  Russia: { headOfState: "Vladimir Poutine", rulingParty: "Russie unie" },
  Australia: { headOfState: "Charles III", rulingParty: "Australian Labor Party" },
  "New Zealand": { headOfState: "Charles III", rulingParty: "New Zealand National Party" }
};

const COUNTRY_NAME_ALIASES = new Map([
  ["united states of america", "United States"],
  ["russian federation", "Russia"],
  ["korea, republic of", "South Korea"],
  ["republic of korea", "South Korea"],
  ["korea, democratic people's republic of", "North Korea"],
  ["cote d'ivoire", "Cote d'Ivoire"],
  ["united kingdom of great britain and northern ireland", "United Kingdom"],
  ["syrian arab republic", "Syria"],
  ["venezuela, bolivarian republic of", "Venezuela"],
  ["bolivia, plurinational state of", "Bolivia"],
  ["tanzania, united republic of", "Tanzania"],
  ["viet nam", "Vietnam"],
  ["lao people's democratic republic", "Laos"],
  ["republic of moldova", "Moldova"],
  ["brunei darussalam", "Brunei"],
  ["czechia", "Czech Republic"],
  ["macao", "Macau"],
  ["hong kong", "Hong Kong"],
  ["micronesia", "Micronesia"],
  ["greenland", "Greenland"]
]);

function clampRating(value) {
  return Math.min(5, Math.max(1, value));
}

function normalizeName(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonFile(filePath) {
  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

function validateCountriesIndex(countryCatalog) {
  const counters = Object.keys(CONTINENT_THRESHOLDS).reduce((acc, continent) => {
    acc[continent] = 0;
    return acc;
  }, {});

  countryCatalog.forEach(country => {
    if (country.continent in counters) counters[country.continent] += 1;
  });

  const failures = Object.entries(CONTINENT_THRESHOLDS)
    .filter(([continent, min]) => counters[continent] <= min)
    .map(([continent, min]) => `${continent}=${counters[continent]} (attendu > ${min})`);

  if (failures.length) {
    throw new Error(`Countries index incomplet: ${failures.join(", ")}`);
  }
}

async function loadCountriesIndex() {
  if (countriesIndexCache) return countriesIndexCache;
  const payload = await readJsonFile(COUNTRIES_INDEX_FILE);
  const countryCatalog = (payload.countries || []).map(country => ({
    name: country.englishName || country.name,
    displayName: country.name,
    iso2: String(country.iso2 || "").toUpperCase(),
    continent: country.continent
  })).filter(c => c.iso2 && c.name && c.continent);

  validateCountriesIndex(countryCatalog);
  countriesIndexCache = countryCatalog;
  return countryCatalog;
}

async function readCacheFile() {
  try {
    return await readJsonFile(CACHE_FILE);
  } catch {
    return null;
  }
}

async function writeCacheFile(data) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // ignore
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function fetchWikidataBatch(batch) {
  const values = batch.map(entry => `"${entry.iso2}"`).join(" ");
  const query = `
    SELECT ?iso2
      (SAMPLE(?headOfStateLabel) AS ?headOfState)
      (SAMPLE(COALESCE(?rulingPartyLabel, ?headPartyLabel)) AS ?rulingParty)
      (MIN(?electionDate) AS ?nextElection)
      (SAMPLE(?isDemocracy) AS ?isDemocracy)
    WHERE {
      VALUES ?iso2 { ${values} }
      ?country wdt:P297 ?iso2 .
      OPTIONAL {
        ?country wdt:P35 ?headOfState .
        OPTIONAL { ?headOfState wdt:P102 ?headParty . }
      }
      OPTIONAL { ?country wdt:P3078 ?rulingParty . }
      OPTIONAL {
        ?election wdt:P31/wdt:P279* wd:Q40231 ;
          wdt:P17 ?country ;
          wdt:P585 ?electionDate .
        FILTER(?electionDate >= NOW())
      }
      BIND(EXISTS { ?country wdt:P122 ?govType . ?govType wdt:P279* wd:Q7174 } AS ?isDemocracy)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }
    GROUP BY ?iso2
  `;

  const data = await fetchJson("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql+json",
      "Content-Type": "application/sparql-query"
    },
    body: query
  });

  const output = {};
  for (const row of data?.results?.bindings || []) {
    const iso2 = row.iso2?.value;
    if (!iso2) continue;
    output[iso2] = {
      headOfState: row.headOfState?.value || null,
      rulingParty: row.rulingParty?.value || null,
      nextElection: row.nextElection?.value || null,
      isDemocracy: row.isDemocracy?.value === "true"
    };
  }
  return output;
}

async function fetchWikidataFacts(countryCatalog) {
  const batches = chunkArray(countryCatalog, 40);
  const output = {};

  for (const batch of batches) {
    try {
      const partial = await fetchWikidataBatch(batch);
      Object.assign(output, partial);
    } catch {
      // continue with remaining batches
    }
  }

  return output;
}

async function fetchWorldBankIndicator(iso2, indicator) {
  const data = await fetchJson(`https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?format=json`);
  const series = Array.isArray(data) ? data[1] : null;
  if (!Array.isArray(series)) return null;
  const entry = series.find(row => row && row.value !== null && row.value !== undefined);
  return entry ? entry.value : null;
}

function ratingFromPercentile(value) {
  if (value === null || value === undefined) return null;
  return clampRating(Math.round((value / 100) * 4 + 1));
}

function ratingFromLifeExpectancy(value) {
  if (value === null || value === undefined) return null;
  return clampRating(Math.round(((value - 50) / (85 - 50)) * 4 + 1));
}

function averageRating(values) {
  const valid = values.filter(v => typeof v === "number" && !Number.isNaN(v));
  if (!valid.length) return null;
  return clampRating(Math.round(valid.reduce((acc, v) => acc + v, 0) / valid.length));
}

function formatCurrency(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n);
}

async function fetchWorldBankRatings(countryCatalog) {
  const indicators = {
    security: "PV.PER.RNK",
    business: "GE.PER.RNK",
    expat: "RL.PER.RNK",
    health: "SP.DYN.LE00.IN",
    gdpPerCapita: "NY.GDP.PCAP.CD"
  };
  const results = {};

  await Promise.all(countryCatalog.map(async entry => {
    const [securityRaw, businessRaw, expatRaw, healthRaw, gdpPerCapitaRaw] = await Promise.all([
      fetchWorldBankIndicator(entry.iso2, indicators.security),
      fetchWorldBankIndicator(entry.iso2, indicators.business),
      fetchWorldBankIndicator(entry.iso2, indicators.expat),
      fetchWorldBankIndicator(entry.iso2, indicators.health),
      fetchWorldBankIndicator(entry.iso2, indicators.gdpPerCapita)
    ]);

    const security = ratingFromPercentile(securityRaw);
    const business = ratingFromPercentile(businessRaw);
    const expat = ratingFromPercentile(expatRaw);
    const health = ratingFromLifeExpectancy(healthRaw);
    const fallback = averageRating([security, business, expat, health]);

    results[entry.iso2] = {
      security: security ?? fallback,
      business: business ?? fallback,
      expat: expat ?? fallback,
      health: health ?? fallback,
      overall: fallback,
      gdpPerCapita: formatCurrency(gdpPerCapitaRaw),
      raw: {
        security: securityRaw,
        business: businessRaw,
        expat: expatRaw,
        health: healthRaw,
        gdpPerCapita: gdpPerCapitaRaw
      }
    };
  }));

  return results;
}

function parseJsonish(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    try {
      return Function(`"use strict"; return (${payload});`)();
    } catch {
      return null;
    }
  }
}

function extractRankingEntries(root) {
  const matches = [];
  const seen = new Set();
  const walk = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== "object") return;
    if (("rank" in value || "ranking" in value) && ("country" in value || "country_name" in value || "name" in value || "countryName" in value)) {
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(value);
      }
    }
    Object.values(value).forEach(walk);
  };
  walk(root);
  return matches;
}

function resolveCountryName(entry, catalog, isoToName) {
  const iso2 = String(entry.iso2 || entry.iso || entry.code || entry.country_code || "").toUpperCase();
  if (iso2 && isoToName.has(iso2)) return isoToName.get(iso2);
  const rawName = entry.country || entry.country_name || entry.name || entry.countryName;
  if (!rawName) return null;
  const normalized = normalizeName(rawName);
  const alias = COUNTRY_NAME_ALIASES.get(normalized);
  if (alias) return alias;
  const match = catalog.find(item => normalizeName(item.name) === normalized || normalizeName(item.displayName) === normalized);
  return match ? match.name : null;
}

async function fetchRsfRanking(countryCatalog) {
  const html = await fetchText("https://rsf.org/fr/classement");
  const snippets = [
    html.match(/window\.__NUXT__=([\s\S]*?);<\/script>/)?.[1],
    html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1],
    html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  ].filter(Boolean);

  let data = null;
  for (const snippet of snippets) {
    data = parseJsonish(snippet);
    if (data) break;
  }
  if (!data) return {};

  const entries = extractRankingEntries(data);
  const isoToName = new Map(countryCatalog.map(entry => [entry.iso2, entry.name]));
  const results = {};

  for (const entry of entries) {
    const name = resolveCountryName(entry, countryCatalog, isoToName);
    if (!name) continue;
    const rank = Number(entry.rank || entry.ranking || entry.position || entry.rank_position);
    const score = Number(entry.score || entry.points || entry.note || entry.indice || entry.total);
    if (!Number.isNaN(rank) || !Number.isNaN(score)) {
      results[name] = {
        rank: Number.isNaN(rank) ? null : rank,
        score: Number.isNaN(score) ? null : score
      };
    }
  }

  return results;
}

function buildCountryProfiles({ countryCatalog, wikidataFacts, worldBankRatings, rsfRanking }) {
  const profiles = {};

  for (const entry of countryCatalog) {
    const facts = wikidataFacts[entry.iso2] || {};
    const ratingData = worldBankRatings[entry.iso2] || {};
    const rsf = rsfRanking[entry.name] || {};
    const fallbackFacts = LEADER_PARTY_FALLBACK[entry.name] || {};

    profiles[entry.name] = {
      country: entry.name,
      displayName: entry.displayName,
      iso2: entry.iso2,
      continent: entry.continent,
      headOfState: facts.headOfState || fallbackFacts.headOfState || "Institution en exercice (source structurée indisponible)",
      rulingParty: facts.rulingParty || fallbackFacts.rulingParty || "Configuration parlementaire nationale (source structurée indisponible)",
      nextElection: facts.nextElection,
      isDemocracy: facts.isDemocracy,
      rsfRank: rsf.rank ?? null,
      rsfScore: rsf.score ?? null,
      gdpPerCapita: ratingData.gdpPerCapita ?? null,
      ratings: {
        security: ratingData.security ?? 3,
        health: ratingData.health ?? 3,
        business: ratingData.business ?? 3,
        expat: ratingData.expat ?? 3,
        overall: ratingData.overall ?? 3
      },
      sources: {
        worldBank: ratingData.raw || {},
        wikidata: {
          headOfState: Boolean(facts.headOfState),
          rulingParty: Boolean(facts.rulingParty),
          nextElection: Boolean(facts.nextElection)
        },
        rsf: {
          rank: rsf.rank,
          score: rsf.score
        },
        references: {
          wikipediaCountries: "https://fr.wikipedia.org/wiki/Liste_des_pays_du_monde",
          wikipediaLeaders: "https://fr.wikipedia.org/wiki/Liste_des_dirigeants_actuels_des_États",
          ccifi: "https://www.ccifrance-international.org/le-kiosque/fiches-pays.html",
          coface: `https://www.coface.com/fr/actualites-economie-conseils-d-experts/tableau-de-bord-des-risques-economiques/fiches-risques-pays/${normalizeName(entry.name).replace(/\s+/g, "-")}`
        },
        ratingsMethodology: "Score 1–5 dérivé d’indicateurs World Bank (gouvernance/sécurité/santé) et aligné sur une lecture situation pays de type Coface/CCI."
      }
    };
  }

  return profiles;
}

export async function buildAndCacheProfiles() {
  const countryCatalog = await loadCountriesIndex();

  const [wikidataFacts, worldBankRatings, rsfRanking] = await Promise.all([
    fetchWikidataFacts(countryCatalog).catch(() => ({})),
    fetchWorldBankRatings(countryCatalog).catch(() => ({})),
    fetchRsfRanking(countryCatalog).catch(() => ({}))
  ]);

  const profiles = buildCountryProfiles({ countryCatalog, wikidataFacts, worldBankRatings, rsfRanking });
  const payload = {
    updatedAt: new Date().toISOString(),
    profiles,
    sources: {
      countriesIndex: "assets/countries.json",
      wikidata: "https://query.wikidata.org/sparql",
      worldBank: "https://api.worldbank.org/v2",
      rsf: "https://rsf.org/fr/classement"
    }
  };

  await writeCacheFile(payload);
  memoryCache = payload;
  return payload;
}

export async function getCountryProfiles({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && memoryCache && now - new Date(memoryCache.updatedAt).getTime() < CACHE_TTL_MS) {
    return memoryCache;
  }

  const cache = await readCacheFile();
  if (!forceRefresh && cache?.updatedAt && now - new Date(cache.updatedAt).getTime() < CACHE_TTL_MS) {
    memoryCache = cache;
    return cache;
  }

  try {
    return await buildAndCacheProfiles();
  } catch (error) {
    if (cache) return cache;
    if (memoryCache) return memoryCache;
    throw error;
  }
}

export async function getCountriesCatalog() {
  return loadCountriesIndex();
}

export { CONTINENT_THRESHOLDS };
