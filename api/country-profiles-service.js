import { buildLegacyProfile, loadCountryCatalog, loadCountryProfiles, loadManifest } from "./country-data.js";

let memoryCache = null;

function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length !== 195) {
    throw new Error(`Catalog must contain exactly 195 countries, received ${catalog?.length ?? 0}`);
  }

  const seenIso3 = new Set();
  for (const country of catalog) {
    if (seenIso3.has(country.iso3)) {
      throw new Error(`Duplicate iso3 in catalog: ${country.iso3}`);
    }
    seenIso3.add(country.iso3);
  }
}

function validateProfile(country, profile) {
  if (!profile) throw new Error(`Missing profile for ${country.iso3}`);
  if (profile.country_id !== country.iso3) {
    throw new Error(`Profile ${country.iso3} country_id mismatch`);
  }
  if (profile.continent !== country.continent) {
    throw new Error(`Profile ${country.iso3} continent mismatch`);
  }
}

function buildPayload() {
  const manifest = loadManifest();
  const catalog = loadCountryCatalog();
  const profiles = loadCountryProfiles();
  validateCatalog(catalog);

  const legacyProfiles = {};
  for (const country of catalog) {
    const profile = profiles[country.iso3];
    validateProfile(country, profile);
    legacyProfiles[country.english_name] = buildLegacyProfile(country, profile);
  }

  return {
    updatedAt: manifest.generated_at,
    manifest,
    catalog,
    profiles: legacyProfiles,
    canonicalProfiles: profiles
  };
}

export async function buildAndCacheProfiles() {
  memoryCache = buildPayload();
  return memoryCache;
}

export async function getCountryProfiles({ forceRefresh = false } = {}) {
  if (!memoryCache || forceRefresh) {
    return buildAndCacheProfiles();
  }
  return memoryCache;
}
