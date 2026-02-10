import fs from "fs/promises";
import path from "path";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "agoraflux-country-profiles/1.0";
const CACHE_FILE = path.join(process.cwd(), "assets", "country-profiles-cache.json");

const CORE_COUNTRY_LIST = [
  { name: "Nigeria", iso2: "NG" },
  { name: "South Africa", iso2: "ZA" },
  { name: "Kenya", iso2: "KE" },
  { name: "Egypt", iso2: "EG" },
  { name: "Morocco", iso2: "MA" },
  { name: "Ghana", iso2: "GH" },
  { name: "Senegal", iso2: "SN" },
  { name: "United States", iso2: "US" },
  { name: "Canada", iso2: "CA" },
  { name: "Mexico", iso2: "MX" },
  { name: "Brazil", iso2: "BR" },
  { name: "Argentina", iso2: "AR" },
  { name: "Colombia", iso2: "CO" },
  { name: "Chile", iso2: "CL" },
  { name: "Peru", iso2: "PE" },
  { name: "China", iso2: "CN" },
  { name: "India", iso2: "IN" },
  { name: "Japan", iso2: "JP" },
  { name: "South Korea", iso2: "KR" },
  { name: "Indonesia", iso2: "ID" },
  { name: "Pakistan", iso2: "PK" },
  { name: "France", iso2: "FR" },
  { name: "Germany", iso2: "DE" },
  { name: "United Kingdom", iso2: "GB" },
  { name: "Italy", iso2: "IT" },
  { name: "Spain", iso2: "ES" },
  { name: "Ukraine", iso2: "UA" },
  { name: "Russia", iso2: "RU" },
  { name: "Australia", iso2: "AU" },
  { name: "New Zealand", iso2: "NZ" }
];

let memoryCache = null;


const COUNTRY_CONTINENT = {
  Nigeria: "Afrique","South Africa": "Afrique",Kenya: "Afrique",Egypt: "Afrique",Morocco: "Afrique",Ghana: "Afrique",Senegal: "Afrique",
  "United States": "Amérique du Nord",Canada: "Amérique du Nord",Mexico: "Amérique du Nord",
  Brazil: "Amérique du Sud",Argentina: "Amérique du Sud",Colombia: "Amérique du Sud",Chile: "Amérique du Sud",Peru: "Amérique du Sud",
  China: "Asie",India: "Asie",Japan: "Asie","South Korea": "Asie",Indonesia: "Asie",Pakistan: "Asie",
  France: "Europe",Germany: "Europe","United Kingdom": "Europe",Italy: "Europe",Spain: "Europe",Ukraine: "Europe",Russia: "Europe",
  Australia: "Océanie","New Zealand": "Océanie"
};

const ISO_TO_NAME = new Map(CORE_COUNTRY_LIST.map(entry => [entry.iso2, entry.name]));


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



function mapContinent(region = "") {
  const key = normalizeName(region);
  if (key === "africa") return "Afrique";
  if (key === "europe") return "Europe";
  if (key === "asia") return "Asie";
  if (key === "north america") return "Amérique du Nord";
  if (key === "south america") return "Amérique du Sud";
  if (key === "oceania") return "Océanie";
  if (key === "antarctic") return "Antarctique";
  return "Global";
}

async function fetchAllCountriesCatalog() {
  try {
    const data = await fetchJson("https://restcountries.com/v3.1/all?fields=name,cca2,independent,region");
    const rows = (Array.isArray(data) ? data : [])
      .filter(row => row && row.cca2 && row.name?.common)
      .map(row => ({
        name: row.name.common,
        iso2: String(row.cca2).toUpperCase(),
        continent: mapContinent(row.region)
      }));
    const unique = new Map();
    rows.forEach(row => {
      if (!unique.has(row.iso2)) unique.set(row.iso2, row);
    });
    if (unique.size > 0) return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (_e) {
    // fallback below
  }
  return CORE_COUNTRY_LIST.map(entry => ({
    ...entry,
    continent: COUNTRY_CONTINENT[entry.name] || "Global"
  }));
}

const COUNTRY_NAME_ALIASES = new Map([
  ["united states of america", "United States"],
  ["russian federation", "Russia"],
  ["korea, republic of", "South Korea"],
  ["republic of korea", "South Korea"],
  ["iran", "Iran"],
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

async function readCacheFile() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function writeCacheFile(data) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    // ignore cache write failures
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchWikidataFacts(countryCatalog) {
  const focusCountries = countryCatalog.filter(entry => CORE_COUNTRY_LIST.some(base => base.iso2 === entry.iso2));
  const values = focusCountries.map(entry => `"${entry.iso2}"`).join(" ");
  const query = `
    SELECT ?iso2
      (SAMPLE(?headOfStateLabel) AS ?headOfState)
      (SAMPLE(?rulingPartyLabel) AS ?rulingParty)
      (MIN(?electionDate) AS ?nextElection)
      (SAMPLE(?isDemocracy) AS ?isDemocracy)
    WHERE {
      VALUES ?iso2 { ${values} }
      ?country wdt:P297 ?iso2 .
      OPTIONAL { ?country wdt:P35 ?headOfState . }
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
  const url = "https://query.wikidata.org/sparql";
  const data = await fetchJson(url, {
    method: "POST",
    headers: {
      "Accept": "application/sparql+json",
      "Content-Type": "application/sparql-query"
    },
    body: query
  });
  const output = {};
  data.results.bindings.forEach(row => {
    const iso2 = row.iso2?.value;
    if (!iso2) return;
    output[iso2] = {
      headOfState: row.headOfState?.value || null,
      rulingParty: row.rulingParty?.value || null,
      nextElection: row.nextElection?.value || null,
      isDemocracy: row.isDemocracy?.value === "true"
    };
  });
  return output;
}

async function fetchWorldBankIndicator(iso2, indicator) {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?format=json`;
  const data = await fetchJson(url);
  const series = Array.isArray(data) ? data[1] : null;
  if (!Array.isArray(series)) return null;
  const entry = series.find(row => row && row.value !== null && row.value !== undefined);
  return entry ? entry.value : null;
}

function ratingFromPercentile(value) {
  if (value === null || value === undefined) return null;
  const score = Math.round((value / 100) * 4 + 1);
  return clampRating(score);
}

function ratingFromLifeExpectancy(value) {
  if (value === null || value === undefined) return null;
  const min = 50;
  const max = 85;
  const ratio = (value - min) / (max - min);
  const score = Math.round(ratio * 4 + 1);
  return clampRating(score);
}

function formatCurrency(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function averageRating(values) {
  const valid = values.filter(v => typeof v === "number" && !Number.isNaN(v));
  if (valid.length === 0) return null;
  const avg = valid.reduce((acc, v) => acc + v, 0) / valid.length;
  return clampRating(Math.round(avg));
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
  const focusCountries = countryCatalog.filter(entry => CORE_COUNTRY_LIST.some(base => base.iso2 === entry.iso2));
  await Promise.all(focusCountries.map(async entry => {
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
    const overall = fallback;
    results[entry.iso2] = {
      security: security ?? fallback,
      business: business ?? fallback,
      expat: expat ?? fallback,
      health: health ?? fallback,
      overall,
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
  } catch (error) {
    try {
      return Function(`"use strict"; return (${payload});`)();
    } catch (innerError) {
      return null;
    }
  }
}

function extractRankingEntries(root) {
  const matches = [];
  const seen = new Set();
  const walk = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      if (value.length && value.every(item => item && typeof item === "object" && ("rank" in item || "ranking" in item))) {
        value.forEach(item => {
          if (item && typeof item === "object") matches.push(item);
        });
      }
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      if ("rank" in value && ("country" in value || "country_name" in value || "name" in value || "countryName" in value)) {
        matches.push(value);
      }
      Object.values(value).forEach(walk);
    }
  };
  walk(root);
  return matches.filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveCountryName(entry, isoToName) {
  const iso2 = entry.iso2 || entry.iso || entry.code || entry.country_code || entry.countryCode;
  if (iso2 && isoToName.has(String(iso2).toUpperCase())) {
    return isoToName.get(String(iso2).toUpperCase());
  }
  const rawName = entry.country || entry.country_name || entry.name || entry.countryName;
  if (!rawName) return null;
  const normalized = normalizeName(rawName);
  const alias = COUNTRY_NAME_ALIASES.get(normalized);
  if (alias) return alias;
  const match = COUNTRY_LIST.find(item => normalizeName(item.name) === normalized);
  return match ? match.name : null;
}

async function fetchRsfRanking(countryCatalog) {
  const html = await fetchText("https://rsf.org/fr/classement");
  let data = null;
  const nuxtMatch = html.match(/window\.__NUXT__=([\s\S]*?);<\/script>/);
  if (nuxtMatch) {
    data = parseJsonish(nuxtMatch[1]);
  }
  if (!data) {
    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      data = parseJsonish(nextMatch[1]);
    }
  }
  if (!data) {
    const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      data = parseJsonish(jsonMatch[1]);
    }
  }
  if (!data) {
    return {};
  }
  const entries = extractRankingEntries(data);
  const results = {};
  const isoToName = new Map(countryCatalog.map(entry => [entry.iso2, entry.name]));
  entries.forEach(entry => {
    const name = resolveCountryName(entry, isoToName);
    if (!name) return;
    const rankValue = entry.rank || entry.ranking || entry.position || entry.rank_position;
    const scoreValue = entry.score || entry.points || entry.note || entry.indice || entry.total;
    const rank = rankValue ? Number(rankValue) : null;
    const score = scoreValue ? Number(scoreValue) : null;
    if (!rank && !score) return;
    results[name] = {
      rank: rank && !Number.isNaN(rank) ? rank : null,
      score: score && !Number.isNaN(score) ? score : null
    };
  });
  return results;
}


function buildCountryProfiles({ countryCatalog, wikidataFacts, worldBankRatings, rsfRanking }) {
  const profiles = {};
  COUNTRY_LIST.forEach(entry => {
    const facts = wikidataFacts[entry.iso2] || {};
    const ratingData = worldBankRatings[entry.iso2] || {};
    const rsf = rsfRanking[entry.name] || {};
    profiles[entry.name] = {
      country: entry.name,
      iso2: entry.iso2,
      continent: entry.continent || COUNTRY_CONTINENT[entry.name] || "Global",
      headOfState: facts.headOfState || LEADER_PARTY_FALLBACK[entry.name]?.headOfState || null,
      rulingParty: facts.rulingParty || LEADER_PARTY_FALLBACK[entry.name]?.rulingParty || null,
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
          ccifi: "https://www.ccifrance-international.org/le-kiosque/fiches-pays.html",
          coface: `https://www.coface.com/fr/actualites-economie-conseils-d-experts/tableau-de-bord-des-risques-economiques/fiches-risques-pays/${normalizeName(entry.name).replace(/\s+/g, "-")}`
        },
        ratingsMethodology: "Score 1–5 dérivé d’indicateurs World Bank (gouvernance/sécurité/santé) et aligné sur une lecture risque pays de type Coface/CCI."
      }
    };
  });
  return profiles;
}

export async function buildAndCacheProfiles() {
  const countryCatalog = await fetchAllCountriesCatalog();
  const [wikidataFacts, worldBankRatings, rsfRanking] = await Promise.all([
    fetchWikidataFacts(countryCatalog),
    fetchWorldBankRatings(countryCatalog),
    fetchRsfRanking(countryCatalog)
  ]);
  const profiles = buildCountryProfiles({ countryCatalog, wikidataFacts, worldBankRatings, rsfRanking });
  const payload = {
    updatedAt: new Date().toISOString(),
    profiles,
    sources: {
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
  if (!forceRefresh && cache && cache.updatedAt && now - new Date(cache.updatedAt).getTime() < CACHE_TTL_MS) {
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

export { CORE_COUNTRY_LIST as COUNTRY_LIST };
