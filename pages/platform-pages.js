import {
  formatCurrencyCompact,
  formatCurrencyStandard,
  formatDecimal,
  formatPercent
} from "../shared/country-formatting.js";
import { DATA_UNAVAILABLE } from "../shared/country-profile.js";

function formatDate(value) {
  if (!value) {
    return DATA_UNAVAILABLE;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function indicatorValue(value, formatter) {
  return value === null || value === undefined ? DATA_UNAVAILABLE : formatter(value);
}

function renderMetricCard(label, value) {
  return `
    <article class="fact-card indicator-card">
      <h3>${label}</h3>
      <p class="indicator-value">${value}</p>
    </article>
  `;
}

function renderNewsList(items, emptyCopy = "No verified article links are currently available.") {
  if (!items.length) {
    return `<div class="empty-state small-empty">${emptyCopy}</div>`;
  }

  return `
    <div class="alerts-list">
      ${items
        .map(
          (item) => `
            <article class="alert-card news-card">
              <span class="alert-meta">${item.publisher || "Verified source"}${item.publishedAt ? ` • ${formatDate(item.publishedAt)}` : ""}</span>
              <a class="news-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
              ${item.summary ? `<p>${item.summary}</p>` : ""}
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSourcesList(sources) {
  if (!sources.length) {
    return `<div class="empty-state small-empty">Source metadata is not available for this country.</div>`;
  }

  return `
    <div class="source-list">
      ${sources
        .map(
          (source) => `
            <article class="fact-card source-card">
              <span class="source-category">${source.category}</span>
              <h3><a class="news-link" href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a></h3>
              <p>${source.referenceLabel}</p>
              <small>Fields: ${source.fields.join(", ")}</small>
              <small>Updated: ${formatDate(source.updatedAt)}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderCountryList(entries, activeSlug) {
  return entries
    .map(
      (entry) => `
        <button class="country-card${entry.slug === activeSlug ? " active" : ""}" data-preview-country="${entry.slug}" type="button">
          <strong>${entry.name}</strong>
          <span>${entry.continent}</span>
          <small>Index ${entry.synthetic_index.toFixed(2)}</small>
        </button>
      `
    )
    .join("");
}

export function renderCountryHeatmap(countries, colors) {
  const continents = ["Amérique du Nord", "Amérique du Sud", "Europe", "Afrique", "Asie", "Océanie"];
  return `
    <div class="heatmap-atlas">
      ${continents
        .map(
          (continent) => `
            <section class="atlas-region atlas-${continent.replace(/\s+/g, "-").toLowerCase()}">
              <h3>${continent}</h3>
              <div class="atlas-grid">
                ${countries
                  .filter((country) => country.continent === continent)
                  .map(
                    (country) => `
                      <button
                        type="button"
                        class="atlas-country"
                        data-open-country="${country.slug}"
                        title="${country.name} • ${country.synthetic_index.toFixed(2)} • ${country.summary}"
                        style="--risk:${colors[country.risk_global]}"
                      >
                        <span>${country.name}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </section>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderCountryPreview(country, color) {
  return `
    <article class="hero-card preview-card">
      <div class="details-header">
        <div>
          <span class="eyebrow">${country.continent}</span>
          <h2>${country.name}</h2>
          <p>${country.summary}</p>
        </div>
        <span class="risk-badge" style="--badge-color:${color}">Index ${country.synthetic_index.toFixed(2)}</span>
      </div>
      <div class="mini-metrics">
        <div><span>GDP per capita</span><strong>${indicatorValue(country.metrics.gdpPerCapita, formatCurrencyStandard)}</strong></div>
        <div><span>HDI</span><strong>${indicatorValue(country.metrics.hdi, (value) => formatDecimal(value, 3))}</strong></div>
        <div><span>Last updated</span><strong>${formatDate(country.lastUpdated)}</strong></div>
      </div>
      <button class="cta-button" type="button" data-open-country="${country.slug}">Open full intelligence page</button>
    </article>
  `;
}

export function renderAlertsPanel(alerts) {
  return renderNewsList(alerts, "No verified coverage is currently available.");
}

export function renderTimeline(events) {
  if (!events.length) {
    return `<div class="empty-state small-empty">No verified timeline entries are currently available.</div>`;
  }

  return `
    <div class="timeline-list">
      ${events
        .map(
          (event) => `
            <article class="timeline-item">
              <span>${formatDate(event.publishedAt)}</span>
              <a class="news-link" href="${event.url}" target="_blank" rel="noopener noreferrer">${event.title}</a>
              ${event.summary ? `<p>${event.summary}</p>` : ""}
              <small>${event.publisher || "Verified source"}${event.countries?.length ? ` • ${event.countries.join(", ")}` : ""}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderHomeShell({ totalCountries, activeContinent, filters, countryList, heatmap, preview, alerts }) {
  return `
    <main class="app-shell intelligence-shell">
      <section class="hero intelligence-hero">
        <article class="hero-card">
          <span class="eyebrow">AGORAFLUX Intelligence</span>
          <h1>Verified country intelligence, sourced end to end.</h1>
          <p class="hero-copy">
            Explore country profiles built from documented macroeconomic sources and verified article links.
          </p>
          <div class="hero-meta">
            <div class="hero-stat"><strong>${totalCountries}</strong><span>UN countries</span></div>
            <div class="hero-stat"><strong>1</strong><span>API route</span></div>
            <div class="hero-stat"><strong>${activeContinent}</strong><span>Current filter</span></div>
          </div>
          <div class="hero-actions">
            <a class="cta-button" href="/dashboard">Open global dashboard</a>
          </div>
        </article>
        <aside class="panel alerts-panel">
          <h2>Verified coverage</h2>
          ${alerts}
        </aside>
      </section>

      <section class="layout dashboard-layout">
        <aside class="panel sidebar-panel">
          <h2>Search countries</h2>
          <input id="countrySearch" class="search-input" type="search" placeholder="Search France, Japan, Brazil..." />
          <div class="chip-row">
            ${filters
              .map(
                (continent) => `
                  <button class="chip${continent === activeContinent ? " active" : ""}" type="button" data-continent="${continent}">
                    ${continent}
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="country-list">${countryList}</div>
        </aside>

        <section class="details">
          <article class="panel map-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Global risk heatmap</span>
                <h2>World risk atlas</h2>
              </div>
              <p>Open any country to access its sourced macroeconomic profile and verified links.</p>
            </div>
            ${heatmap}
          </article>
          ${preview}
        </section>
      </section>
    </main>
  `;
}

export function renderDashboardLayout({ totalCountries, topRiskChart, topStableChart, distributionChart, continentChart, hotspots, timeline, alerts, compareOptions, comparisonChart }) {
  return `
    <main class="app-shell intelligence-shell">
      <section class="hero intelligence-hero">
        <article class="hero-card">
          <span class="eyebrow">Global dashboard</span>
          <h1>Country profiles backed by documented data and verified coverage.</h1>
          <p class="hero-copy">Benchmark country exposure, compare sourced macro indicators, and review recent verified coverage.</p>
          <div class="hero-meta">
            <div class="hero-stat"><strong>${totalCountries}</strong><span>Countries indexed</span></div>
            <div class="hero-stat"><strong>Static</strong><span>Versioned country data</span></div>
            <div class="hero-stat"><strong>Verified</strong><span>Clickable source links</span></div>
          </div>
          <div class="hero-actions">
            <a class="cta-button" href="/">Back to atlas</a>
          </div>
        </article>
        <aside class="panel alerts-panel">
          <h2>Latest verified coverage</h2>
          ${alerts}
        </aside>
      </section>

      <section class="analytics-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Top 10 highest risk countries</h2></div>
          ${topRiskChart}
        </article>
        <article class="panel">
          <div class="panel-heading"><h2>Top 10 most stable countries</h2></div>
          ${topStableChart}
        </article>
        <article class="panel">
          <div class="panel-heading"><h2>Global risk distribution</h2></div>
          ${distributionChart}
        </article>
        <article class="panel">
          <div class="panel-heading"><h2>Continent risk averages</h2></div>
          ${continentChart}
        </article>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Geopolitical hotspots</h2></div>
          <div class="hotspot-list">
            ${hotspots
              .map(
                (hotspot) => `
                  <article class="hotspot-card">
                    <h3>${hotspot.continent}</h3>
                    <p>${hotspot.summary}</p>
                    <div class="hotspot-chips">
                      ${hotspot.countries
                        .map(
                          (country) => `
                            <button type="button" class="chip soft" data-open-country="${country.slug}">
                              ${country.name} · ${country.synthetic_index.toFixed(2)}
                            </button>
                          `
                        )
                        .join("")}
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading"><h2>Coverage timeline</h2></div>
          ${timeline}
        </article>
      </section>

      <section class="panel comparison-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Country comparison tool</span>
            <h2>Compare sourced macro indicators</h2>
          </div>
        </div>
        <select id="compareCountries" class="compare-select" multiple size="8">
          ${compareOptions}
        </select>
        ${comparisonChart}
      </section>
    </main>
  `;
}

export function renderCountryDetailLayout({ profile, summary, news, comparePeers }) {
  const economicCards = [
    ["GDP", indicatorValue(profile.metrics.gdp, formatCurrencyCompact)],
    ["GDP per capita", indicatorValue(profile.metrics.gdpPerCapita, formatCurrencyStandard)],
    ["Growth", indicatorValue(profile.metrics.growth, formatPercent)],
    ["Inflation", indicatorValue(profile.metrics.inflation, formatPercent)],
    ["Unemployment", indicatorValue(profile.metrics.unemployment, formatPercent)]
  ];

  const metadataCards = [
    ["Population", indicatorValue(profile.metrics.population, (value) => Math.round(value).toLocaleString("en-US"))],
    ["Currency", profile.currency || DATA_UNAVAILABLE],
    ["Income group", profile.incomeGroup || DATA_UNAVAILABLE],
    ["Region", profile.region || DATA_UNAVAILABLE]
  ];
  const heroStats = [
    ["GDP growth", indicatorValue(profile.metrics.growth, formatPercent)],
    ["Inflation", indicatorValue(profile.metrics.inflation, formatPercent)],
    ["Unemployment", indicatorValue(profile.metrics.unemployment, formatPercent)],
    ["Last updated", formatDate(profile.lastUpdated)]
  ];

  if (profile.metrics.hdi !== null && profile.metrics.hdi !== undefined) {
    heroStats.splice(3, 0, ["HDI", formatDecimal(profile.metrics.hdi, 3)]);
  }

  return `
    <main class="app-shell intelligence-shell">
      <section class="hero intelligence-hero">
        <article class="hero-card">
          <span class="eyebrow">${profile.continent}${profile.region ? ` • ${profile.region}` : ""}</span>
          <h1>${profile.name}</h1>
          <p class="hero-copy">${profile.analysis?.summary || summary?.summary || ""}</p>
          <div class="hero-meta">
            ${heroStats
              .map(
                ([label, value]) => `
                  <div class="hero-stat"><strong>${value}</strong><span>${label}</span></div>
                `
              )
              .join("")}
          </div>
          <div class="hero-actions">
            <a class="cta-button" href="/dashboard">Open global dashboard</a>
            <a class="ghost-link" href="/">Back to atlas</a>
          </div>
        </article>
        <aside class="panel">
          <div class="panel-heading"><h2>Country snapshot</h2></div>
          <div class="facts-grid compact">
            ${metadataCards.map(([label, value]) => renderMetricCard(label, value)).join("")}
          </div>
        </aside>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Economic indicators</h2></div>
          <div class="facts-grid compact">
            ${economicCards.map(([label, value]) => renderMetricCard(label, value)).join("")}
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading"><h2>Methodology & sources</h2></div>
          ${renderSourcesList(profile.sources || [])}
        </article>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Verified news coverage</h2></div>
          ${renderNewsList(news)}
        </article>

        <article class="panel">
          <div class="panel-heading"><h2>Compare with peers</h2></div>
          <div class="hotspot-chips">
            ${comparePeers
              .map(
                (country) => `
                  <button type="button" class="chip soft" data-open-country="${country.slug}">
                    ${country.name} · ${country.synthetic_index.toFixed(2)}
                  </button>
                `
              )
              .join("")}
          </div>
        </article>
      </section>
    </main>
  `;
}
