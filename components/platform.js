import { renderBarChart, renderComparisonChart, renderRadarChart } from "./charts.js";
import {
  renderCountryDetailLayout,
  renderCountryHeatmap,
  renderCountryList,
  renderCountryPreview,
  renderDashboardLayout,
  renderHomeShell,
  renderTimeline,
  renderAlertsPanel
} from "../pages/platform-pages.js";

const state = {
  dashboard: null,
  timeline: [],
  alerts: [],
  query: "",
  continent: "All",
  selectedSlug: null,
  compareSelection: []
};

const CONTINENTS = ["All", "Afrique", "Amérique du Nord", "Amérique du Sud", "Asie", "Europe", "Océanie", "Antarctique"];
const RISK_COLORS = {
  1: "#2f9e44",
  2: "#8bcf72",
  3: "#f4c95d",
  4: "#f08c28",
  5: "#d94841"
};

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .trim();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

async function bootstrapData() {
  const [dashboard, timeline, alerts] = await Promise.all([
    fetchJson("/data/dashboard.json"),
    fetchJson("/data/timeline.json"),
    fetchJson("/data/alerts.json")
  ]);
  state.dashboard = dashboard;
  state.timeline = timeline;
  state.alerts = alerts;
}

function getVisibleCountries() {
  return state.dashboard.countries.filter((country) => {
    const byContinent = state.continent === "All" || country.continent === state.continent;
    const byQuery = !state.query || country.name.toLowerCase().includes(state.query.toLowerCase());
    return byContinent && byQuery;
  });
}

function selectCountry(slug) {
  state.selectedSlug = slug;
}

function selectedCountrySummary() {
  return state.dashboard.countries.find((country) => country.slug === state.selectedSlug) || null;
}

function countryTimeline(countryName, continent) {
  return state.timeline.filter((event) => event.countries.includes(countryName) || event.region === continent);
}

function countryAlerts(countryName) {
  return state.alerts.filter((alert) => alert.country === countryName).slice(0, 4);
}

function bindHomeInteractions() {
  document.querySelector("#countrySearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderHomePage();
  });

  document.querySelectorAll("[data-continent]").forEach((button) => {
    button.addEventListener("click", () => {
      state.continent = button.dataset.continent;
      renderHomePage();
    });
  });

  document.querySelectorAll("[data-open-country]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/country/${button.dataset.openCountry}`;
    });
  });

  document.querySelectorAll("[data-preview-country]").forEach((button) => {
    button.addEventListener("mouseenter", () => {
      selectCountry(button.dataset.previewCountry);
      renderHomePage();
    });
    button.addEventListener("focus", () => {
      selectCountry(button.dataset.previewCountry);
      renderHomePage();
    });
    button.addEventListener("click", () => {
      window.location.href = `/country/${button.dataset.previewCountry}`;
    });
  });
}

function bindDashboardInteractions() {
  const select = document.querySelector("#compareCountries");
  if (select) {
    select.addEventListener("change", () => {
      state.compareSelection = Array.from(select.selectedOptions).map((option) => option.value).slice(0, 3);
      renderDashboardPage();
    });
  }

  document.querySelectorAll("[data-open-country]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/country/${button.dataset.openCountry}`;
    });
  });
}

async function renderHomePage() {
  const visible = getVisibleCountries();
  const preview = selectedCountrySummary() || visible[0] || state.dashboard.countries[0];
  if (preview && !state.selectedSlug) {
    state.selectedSlug = preview.slug;
  }

  document.querySelector("#app").innerHTML = renderHomeShell({
    totalCountries: state.dashboard.countries.length,
    activeContinent: state.continent,
    filters: CONTINENTS,
    countryList: renderCountryList(visible, preview?.slug),
    heatmap: renderCountryHeatmap(state.dashboard.countries, RISK_COLORS),
    preview: preview ? renderCountryPreview(preview, RISK_COLORS[preview.risk_global]) : "",
    alerts: renderAlertsPanel(state.alerts)
  });

  bindHomeInteractions();
}

function renderDashboardPage() {
  const compareSelection = state.compareSelection.length ? state.compareSelection : state.dashboard.top_high_risk.slice(0, 3).map((country) => country.slug);
  const compareCountries = compareSelection
    .map((slug) => state.dashboard.countries.find((country) => country.slug === slug))
    .filter(Boolean)
    .map((country) => ({
      ...country,
      gdp_per_capita: country.key_data.gdp_per_capita,
      hdi: country.key_data.hdi,
      unemployment: country.key_data.unemployment
    }));

  document.querySelector("#app").innerHTML = renderDashboardLayout({
    totalCountries: state.dashboard.countries.length,
    topRiskChart: renderBarChart(state.dashboard.top_high_risk, "synthetic_index", "name"),
    topStableChart: renderBarChart(state.dashboard.top_stable, "synthetic_index", "name", "stable"),
    distributionChart: renderBarChart(state.dashboard.distribution, "count", "score"),
    continentChart: renderBarChart(state.dashboard.continent_averages, "average_risk", "continent"),
    hotspots: state.dashboard.hotspots,
    timeline: renderTimeline(state.timeline),
    alerts: renderAlertsPanel(state.alerts.slice(0, 6)),
    compareOptions: state.dashboard.countries
      .map(
        (country) => `
          <option value="${country.slug}" ${compareSelection.includes(country.slug) ? "selected" : ""}>
            ${country.name}
          </option>
        `
      )
      .join(""),
    comparisonChart: renderComparisonChart(compareCountries)
  });

  bindDashboardInteractions();
}

async function renderCountryPage() {
  const slug = window.location.pathname.split("/").filter(Boolean).pop();
  const profile = await fetchJson(`/api/country/${slug}`);
  const summary = state.dashboard.countries.find((country) => country.slug === slug);
  const timeline = countryTimeline(profile.name, profile.continent);
  const alerts = countryAlerts(profile.name);

  document.querySelector("#app").innerHTML = renderCountryDetailLayout({
    profile,
    summary,
    radarChart: renderRadarChart(profile.risk_barometer),
    timeline: renderTimeline(timeline),
    alerts: renderAlertsPanel(alerts),
    comparePeers: state.dashboard.countries
      .filter((country) => country.continent === profile.continent && country.slug !== slug)
      .slice(0, 3)
  });

  document.querySelectorAll("[data-open-country]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/country/${button.dataset.openCountry}`;
    });
  });
}

export async function bootPlatform() {
  await bootstrapData();

  if (window.location.pathname.startsWith("/dashboard")) {
    renderDashboardPage();
    return;
  }

  if (window.location.pathname.startsWith("/country/")) {
    await renderCountryPage();
    return;
  }

  renderHomePage();
}
