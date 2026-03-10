import fs from "node:fs/promises";
import path from "node:path";
import { flattenCountries, loadCountryProfileBySlug } from "../server/country-store.js";
import { generateCountrySummary } from "../shared/country-formatting.js";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");

const RISK_WEIGHTS = {
  geopolitics: 0.24,
  politics: 0.18,
  socio_economic: 0.17,
  crime: 0.12,
  terrorism: 0.17,
  health_disasters: 0.12
};

const HOTSPOT_HINTS = {
  Europe: "Risk exposure remains concentrated around war spillovers, infrastructure security, and energy resilience.",
  Asie: "Strategic competition, supply-chain chokepoints, and maritime disputes shape the region's main hotspots.",
  Afrique: "Conflict intensity, displacement, and climate-linked fragility continue to dominate the regional picture.",
  "Amérique du Nord": "Security, migration, and governance pressure remain the primary cross-border monitoring themes.",
  "Amérique du Sud": "Political volatility, fiscal fragility, and organized crime remain the leading watchpoints.",
  "Océanie": "Climate exposure and strategic competition shape the region's most sensitive scenarios.",
  Antarctique: "No UN sovereign states are assigned to Antarctica in the current dataset."
};

function computeSyntheticIndex(profile) {
  const weighted = Object.entries(RISK_WEIGHTS).reduce((total, [key, weight]) => {
    return total + (profile.risk_barometer[key] || 0) * weight;
  }, 0);
  return Number(weighted.toFixed(2));
}

function buildCountrySummary(entry, profile) {
  return {
    name: entry.name,
    slug: entry.slug,
    continent: entry.continent,
    region: profile.region,
    incomeGroup: profile.incomeGroup,
    currency: profile.currency,
    lastUpdated: profile.lastUpdated,
    risk_global: profile.risk_global,
    synthetic_index: computeSyntheticIndex(profile),
    summary: generateCountrySummary(profile),
    metrics: {
      population: profile.metrics.population,
      gdp: profile.metrics.gdp,
      gdpPerCapita: profile.metrics.gdpPerCapita,
      growth: profile.metrics.growth,
      inflation: profile.metrics.inflation,
      unemployment: profile.metrics.unemployment,
      hdi: profile.metrics.hdi
    }
  };
}

function buildNewsFeeds(profilesBySlug) {
  const deduped = new Map();

  for (const [slug, profile] of profilesBySlug.entries()) {
    for (const article of profile.news || []) {
      const key = article.url;
      if (!deduped.has(key)) {
        deduped.set(key, {
          ...article,
          countries: [],
          countrySlugs: [],
          region: profile.continent
        });
      }

      const item = deduped.get(key);
      if (!item.countrySlugs.includes(slug)) {
        item.countrySlugs.push(slug);
        item.countries.push(profile.name);
      }
    }
  }

  const allArticles = [...deduped.values()].sort((left, right) => (right.publishedAt || "").localeCompare(left.publishedAt || ""));

  return {
    alerts: allArticles.slice(0, 8),
    timeline: allArticles.slice(0, 12)
  };
}

function buildDashboardPayload(countries) {
  const sortedByRisk = [...countries].sort((left, right) => right.synthetic_index - left.synthetic_index);
  const sortedByStability = [...countries].sort((left, right) => left.synthetic_index - right.synthetic_index);

  const continentAverages = Object.entries(
    countries.reduce((acc, country) => {
      if (!acc[country.continent]) {
        acc[country.continent] = [];
      }
      acc[country.continent].push(country.synthetic_index);
      return acc;
    }, {})
  ).map(([continent, values]) => ({
    continent,
    average_risk: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
  }));

  const distribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: countries.filter((country) => country.risk_global === score).length
  }));

  const hotspots = continentAverages.map(({ continent }) => {
    const subset = countries
      .filter((country) => country.continent === continent)
      .sort((left, right) => right.synthetic_index - left.synthetic_index)
      .slice(0, 3);
    return {
      continent,
      summary: HOTSPOT_HINTS[continent],
      countries: subset
    };
  });

  return {
    generated_at: new Date().toISOString(),
    countries,
    top_high_risk: sortedByRisk.slice(0, 10),
    top_stable: sortedByStability.slice(0, 10),
    continent_averages: continentAverages.sort((left, right) => right.average_risk - left.average_risk),
    distribution,
    hotspots
  };
}

async function writeJson(fileName, payload) {
  await fs.writeFile(path.join(DATA_DIR, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function main() {
  const entries = flattenCountries();
  const profilesBySlug = new Map();
  const countries = entries.map((entry) => {
    const profile = loadCountryProfileBySlug(entry.slug);
    profilesBySlug.set(entry.slug, profile);
    return buildCountrySummary(entry, profile);
  });
  const dashboard = buildDashboardPayload(countries);
  const feeds = buildNewsFeeds(profilesBySlug);

  await Promise.all([
    writeJson("dashboard.json", dashboard),
    writeJson("timeline.json", feeds.timeline),
    writeJson("alerts.json", feeds.alerts)
  ]);

  console.log(JSON.stringify({
    generated_at: dashboard.generated_at,
    countries: countries.length,
    alerts: feeds.alerts.length,
    events: feeds.timeline.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
