import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = path.join(process.cwd(), "country_profiles", "data");
const CATALOG_PATH = path.join(DATA_ROOT, "catalog", "countries.json");
const MANIFEST_PATH = path.join(DATA_ROOT, "manifest.json");
const PROFILES_DIR = path.join(DATA_ROOT, "profiles");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function normalize(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function legacyRatings(profile) {
  return {
    security: profile.barometre_risques.criminalite,
    business: profile.barometre_risques.socio_economique,
    health: profile.barometre_risques.sanitaire_catastrophes,
    expat: profile.barometre_risques.deplacements,
    overall: profile.niveau_risque_global
  };
}

export function loadCountryCatalog() {
  return readJson(CATALOG_PATH);
}

export function loadManifest() {
  return readJson(MANIFEST_PATH);
}

export function loadCountryProfiles() {
  const catalog = loadCountryCatalog();
  const profiles = {};

  for (const country of catalog) {
    const profilePath = path.join(PROFILES_DIR, `${country.iso3}.json`);
    profiles[country.iso3] = readJson(profilePath);
  }

  return profiles;
}

export function findCountryEntry(query, catalog = loadCountryCatalog()) {
  const target = normalize(query);
  if (!target) return null;

  return catalog.find((country) => {
    return [
      country.country_id,
      country.iso2,
      country.iso3,
      country.nom_officiel,
      country.nom_court,
      country.english_name
    ].some((value) => normalize(String(value || "")) === target);
  }) || null;
}

export function buildLegacyProfile(country, profile) {
  return {
    country: country.english_name,
    displayName: country.nom_court,
    countryId: country.country_id,
    iso2: country.iso2,
    iso3: country.iso3,
    continent: country.continent,
    headOfState: "Chef d’État non publié",
    rulingParty: "Configuration institutionnelle",
    primeMinister: null,
    governor: null,
    nextElection: null,
    isDemocracy: null,
    rsfRank: "Non publié",
    rsfScore: null,
    gdpPerCapita: profile.donnees_cles.croissance_pib ?? null,
    ratings: legacyRatings(profile),
    summary: profile.synthese,
    canonical: profile
  };
}

export function loadLegacyProfiles() {
  const catalog = loadCountryCatalog();
  const profiles = loadCountryProfiles();
  const out = {};

  for (const country of catalog) {
    out[country.english_name] = buildLegacyProfile(country, profiles[country.iso3]);
  }

  return out;
}
