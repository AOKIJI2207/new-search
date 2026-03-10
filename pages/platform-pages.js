function riskBadge(score, color) {
  return `
    <span class="risk-badge" style="--badge-color:${color}">
      Risk ${score}/5
    </span>
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
                        title="${country.name} • ${country.risk_global}/5 • ${country.summary}"
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
        ${riskBadge(country.risk_global, color)}
      </div>
      <div class="mini-metrics">
        <div><span>Synthetic index</span><strong>${country.synthetic_index.toFixed(2)}</strong></div>
        <div><span>GDP per capita</span><strong>${country.key_data.gdp_per_capita_display || "n/a"}</strong></div>
        <div><span>HDI</span><strong>${country.key_data.hdi_display || "n/a"}</strong></div>
      </div>
      <button class="cta-button" type="button" data-open-country="${country.slug}">Open full intelligence page</button>
    </article>
  `;
}

export function renderAlertsPanel(alerts) {
  return `
    <div class="alerts-list">
      ${alerts
        .map(
          (alert) => `
            <article class="alert-card">
              <span class="alert-meta">${alert.country} • ${alert.category} • ${new Date(alert.timestamp).toLocaleString("en-GB")}</span>
              <strong>${alert.headline}</strong>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderTimeline(events) {
  if (!events.length) {
    return `<div class="empty-state small-empty">No curated events available for this filter.</div>`;
  }

  return `
    <div class="timeline-list">
      ${events
        .map(
          (event) => `
            <article class="timeline-item">
              <span>${new Date(event.date).toLocaleDateString("en-GB")}</span>
              <strong>${event.title}</strong>
              <p>${event.summary}</p>
              <small>${event.region} • ${event.risk_category}</small>
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
          <h1>Interactive geopolitical intelligence dashboard.</h1>
          <p class="hero-copy">
            Explore a global risk heatmap, open dedicated country intelligence pages, and monitor the
            latest curated alerts without changing the underlying API architecture.
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
          <h2>Recent geopolitical alerts</h2>
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
              <p>Hover any country for its global score and click to open the full intelligence page.</p>
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
          <h1>Planet-scale geopolitical risk analytics.</h1>
          <p class="hero-copy">Benchmark risk exposure, compare countries, and monitor structural hotspots with static analytics built from the live dataset.</p>
          <div class="hero-meta">
            <div class="hero-stat"><strong>${totalCountries}</strong><span>Countries indexed</span></div>
            <div class="hero-stat"><strong>Top 10</strong><span>High risk and stable lists</span></div>
            <div class="hero-stat"><strong>Static</strong><span>Dashboard data delivery</span></div>
          </div>
          <div class="hero-actions">
            <a class="cta-button" href="/">Back to atlas</a>
          </div>
        </article>
        <aside class="panel alerts-panel">
          <h2>Alert panel</h2>
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
          <div class="panel-heading"><h2>Global crisis timeline</h2></div>
          ${timeline}
        </article>
      </section>

      <section class="panel comparison-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Country comparison tool</span>
            <h2>Compare multiple countries</h2>
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

export function renderCountryDetailLayout({ profile, summary, radarChart, timeline, alerts, comparePeers }) {
  return `
    <main class="app-shell intelligence-shell">
      <section class="hero intelligence-hero">
        <article class="hero-card">
          <span class="eyebrow">${profile.continent}</span>
          <h1>${profile.name}</h1>
          <p class="hero-copy">${profile.analysis.summary}</p>
          <div class="hero-meta">
            <div class="hero-stat"><strong>${profile.risk_global}/5</strong><span>Global risk</span></div>
            <div class="hero-stat"><strong>${summary?.synthetic_index?.toFixed(2) || "n/a"}</strong><span>Synthetic index</span></div>
            <div class="hero-stat"><strong>${profile.key_data.hdi}</strong><span>HDI</span></div>
          </div>
          <div class="hero-actions">
            <a class="cta-button" href="/dashboard">Open global dashboard</a>
            <a class="ghost-link" href="/">Back to atlas</a>
          </div>
        </article>
        <aside class="panel">
          <div class="panel-heading"><h2>Risk radar</h2></div>
          ${radarChart}
        </aside>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Economic indicators</h2></div>
          <div class="facts-grid compact">
            <article class="fact-card"><h3>GDP</h3><p>${profile.key_data.gdp}</p></article>
            <article class="fact-card"><h3>GDP per capita</h3><p>${profile.key_data.gdp_per_capita}</p></article>
            <article class="fact-card"><h3>Growth</h3><p>${profile.key_data.growth}</p></article>
            <article class="fact-card"><h3>Inflation</h3><p>${profile.key_data.inflation}</p></article>
            <article class="fact-card"><h3>Unemployment</h3><p>${profile.key_data.unemployment}</p></article>
            <article class="fact-card"><h3>HDI</h3><p>${profile.key_data.hdi}</p></article>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading"><h2>Real-time alert panel</h2></div>
          ${alerts}
        </article>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Geopolitical analysis</h2></div>
          <div class="analysis-grid">
            <article class="analysis-card"><h3>Geopolitics</h3><p>${profile.analysis.geopolitics}</p></article>
            <article class="analysis-card"><h3>Politics</h3><p>${profile.analysis.politics}</p></article>
            <article class="analysis-card"><h3>Economy</h3><p>${profile.analysis.economy}</p></article>
            <article class="analysis-card"><h3>Regional analysis</h3><p>${profile.analysis.regional_analysis}</p></article>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading"><h2>Security analysis</h2></div>
          <div class="analysis-grid">
            <article class="analysis-card"><h3>Security</h3><p>${profile.analysis.security}</p></article>
            <article class="analysis-card"><h3>Crime</h3><p>${profile.analysis.crime}</p></article>
            <article class="analysis-card"><h3>Terrorism</h3><p>${profile.analysis.terrorism}</p></article>
            <article class="analysis-card"><h3>Health & disasters</h3><p>${profile.analysis.health_disasters}</p></article>
          </div>
        </article>
      </section>

      <section class="analytics-grid secondary-grid">
        <article class="panel">
          <div class="panel-heading"><h2>Recent events timeline</h2></div>
          ${timeline}
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
