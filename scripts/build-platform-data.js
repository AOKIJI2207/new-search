import fs from "node:fs/promises";
import path from "node:path";
import { flattenCountries, loadCountryProfileBySlug } from "../server/country-store.js";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDecimal,
  formatPercent,
  generateCountrySummary
} from "../shared/country-formatting.js";

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
  Europe: "Escalation risk linked to interstate war spillovers, sanctions pressure, and infrastructure exposure.",
  Asie: "Maritime friction, strategic competition, and political volatility shape persistent hotspot dynamics.",
  Afrique: "Conflict fragmentation, insurgent pressure, and governance stress keep several theaters unstable.",
  "Amérique du Nord": "Migration pressure, cartel violence, and strategic competition drive localized instability.",
  "Amérique du Sud": "Institutional volatility, organized crime, and social unrest drive emerging hotspots.",
  "Océanie": "Climate exposure and strategic contestation shape the region's most sensitive flashpoints.",
  Antarctique: "No UN sovereign states are assigned to Antarctica in the current dataset."
};

const TIMELINE_EVENTS = [
  {
    date: "2026-03-04",
    title: "Red Sea disruption persists across key trade lanes",
    countries: ["Egypt", "Saudi Arabia", "Yemen"],
    region: "Asie",
    risk_category: "transport",
    summary: "Commercial traffic remains under pressure from maritime security incidents and rerouting costs."
  },
  {
    date: "2026-02-18",
    title: "Sudan conflict keeps regional displacement pressure elevated",
    countries: ["Sudan", "South Sudan", "Egypt", "Chad"],
    region: "Afrique",
    risk_category: "security",
    summary: "Cross-border humanitarian movements continue to affect security and logistical planning."
  },
  {
    date: "2026-01-29",
    title: "Taiwan Strait tensions trigger renewed contingency planning",
    countries: ["China"],
    region: "Asie",
    risk_category: "geopolitics",
    summary: "Military signaling and supply-chain exposure remain central concerns for regional operators."
  },
  {
    date: "2025-12-11",
    title: "Sahel security environment remains highly fragmented",
    countries: ["Mali", "Burkina Faso", "Niger"],
    region: "Afrique",
    risk_category: "terrorism",
    summary: "Insurgent activity and weak state control continue to reshape access and operating conditions."
  },
  {
    date: "2025-11-07",
    title: "Haiti crisis intensifies international stabilization debate",
    countries: ["Haiti"],
    region: "Amérique du Nord",
    risk_category: "crime",
    summary: "Gang violence and governance paralysis keep the country under sustained crisis monitoring."
  },
  {
    date: "2025-10-16",
    title: "Horn of Africa drought stress compounds socio-economic fragility",
    countries: ["Ethiopia", "Somalia", "Kenya"],
    region: "Afrique",
    risk_category: "health_disasters",
    summary: "Climate stress continues to interact with food security and mobility risks."
  },
  {
    date: "2025-09-02",
    title: "South China Sea incidents increase pressure on regional navies",
    countries: ["Philippines", "Vietnam", "China"],
    region: "Asie",
    risk_category: "geopolitics",
    summary: "Repeated incidents reinforce military alert postures and energy corridor sensitivities."
  },
  {
    date: "2025-08-21",
    title: "Ukraine front line volatility keeps Europe on elevated alert",
    countries: ["Ukraine", "Russia", "Poland"],
    region: "Europe",
    risk_category: "security",
    summary: "Missile threats, logistics risks, and alliance planning remain dominant regional drivers."
  },
  {
    date: "2025-06-13",
    title: "Venezuela election tensions deepen regional diplomatic strain",
    countries: ["Venezuela", "Colombia", "Brazil"],
    region: "Amérique du Sud",
    risk_category: "politics",
    summary: "Political polarization and migration spillovers continue to shape cross-border risk monitoring."
  },
  {
    date: "2024-11-18",
    title: "Russia-Ukraine escalation reshapes European security planning",
    countries: ["Ukraine", "Russia"],
    region: "Europe",
    risk_category: "geopolitics",
    summary: "Escalatory signaling and allied support decisions remain decisive for continental risk posture."
  },
  {
    date: "2023-04-20",
    title: "Sudan civil war redraws humanitarian and security priorities",
    countries: ["Sudan", "South Sudan"],
    region: "Afrique",
    risk_category: "security",
    summary: "Urban fighting and humanitarian disruption created lasting instability across the region."
  },
  {
    date: "2022-08-03",
    title: "Taiwan tensions reframe Indo-Pacific deterrence posture",
    countries: ["China"],
    region: "Asie",
    risk_category: "geopolitics",
    summary: "Strategic rivalry and military signaling triggered a durable step-up in regional contingency planning."
  }
];

const ALERTS = [
  {
    timestamp: "2026-03-10T08:10:00Z",
    headline: "Maritime insurers raise scrutiny on Red Sea-bound cargo",
    country: "Yemen",
    category: "transport",
    severity: 5
  },
  {
    timestamp: "2026-03-10T07:30:00Z",
    headline: "Cross-border monitoring intensified around eastern DRC corridors",
    country: "DR Congo",
    category: "security",
    severity: 5
  },
  {
    timestamp: "2026-03-10T06:45:00Z",
    headline: "Political mobilization rises ahead of a fragile coalition vote",
    country: "Israel",
    category: "politics",
    severity: 4
  },
  {
    timestamp: "2026-03-10T06:00:00Z",
    headline: "Drought impact alerts renewed for Horn of Africa logistics routes",
    country: "Somalia",
    category: "health_disasters",
    severity: 4
  },
  {
    timestamp: "2026-03-10T05:20:00Z",
    headline: "Energy transit operators review contingency assumptions",
    country: "Ukraine",
    category: "geopolitics",
    severity: 4
  },
  {
    timestamp: "2026-03-10T04:45:00Z",
    headline: "Major urban security posture tightened after gang escalation",
    country: "Haiti",
    category: "crime",
    severity: 5
  },
  {
    timestamp: "2026-03-10T04:00:00Z",
    headline: "Taiwan Strait commercial operators report elevated routing sensitivity",
    country: "China",
    category: "geopolitics",
    severity: 4
  },
  {
    timestamp: "2026-03-10T03:20:00Z",
    headline: "Fiscal stress indicators prompt sovereign monitoring review",
    country: "Argentina",
    category: "socio_economic",
    severity: 3
  }
];

function parseCurrency(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function computeSyntheticIndex(profile) {
  const weighted = Object.entries(RISK_WEIGHTS).reduce((total, [key, weight]) => {
    return total + (profile.risk_barometer[key] || 0) * weight;
  }, 0);
  return Number(weighted.toFixed(2));
}

function buildCountrySummary(entry, profile) {
  const syntheticIndex = computeSyntheticIndex(profile);
  return {
    name: entry.name,
    slug: entry.slug,
    continent: entry.continent,
    risk_global: profile.risk_global,
    synthetic_index: syntheticIndex,
    summary: generateCountrySummary(profile),
    risk_barometer: profile.risk_barometer,
    key_data: {
      gdp: parseCurrency(profile.key_data.gdp),
      gdp_display: formatCurrencyCompact(profile.key_data.gdp),
      gdp_per_capita: parseCurrency(profile.key_data.gdp_per_capita),
      gdp_per_capita_display: formatCurrency(profile.key_data.gdp_per_capita),
      growth: parsePercent(profile.key_data.growth),
      growth_display: formatPercent(profile.key_data.growth),
      inflation: parsePercent(profile.key_data.inflation),
      inflation_display: formatPercent(profile.key_data.inflation),
      hdi: parseDecimal(profile.key_data.hdi),
      hdi_display: formatDecimal(profile.key_data.hdi),
      unemployment: parsePercent(profile.key_data.unemployment),
      unemployment_display: formatPercent(profile.key_data.unemployment),
      political_system: profile.key_data.political_system
    }
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
  const countries = entries.map((entry) => buildCountrySummary(entry, loadCountryProfileBySlug(entry.slug)));
  const dashboard = buildDashboardPayload(countries);

  await Promise.all([
    writeJson("dashboard.json", dashboard),
    writeJson("timeline.json", TIMELINE_EVENTS),
    writeJson("alerts.json", ALERTS)
  ]);

  console.log(JSON.stringify({
    generated_at: dashboard.generated_at,
    countries: countries.length,
    alerts: ALERTS.length,
    events: TIMELINE_EVENTS.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
