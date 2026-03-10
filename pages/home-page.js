export function renderAppShell() {
  return `
    <main class="app-shell">
      <section class="hero">
        <article class="hero-card">
          <span class="eyebrow">AGORAFLUX Dataset</span>
          <h1>Global geopolitical country intelligence.</h1>
          <p class="hero-copy">
            Clean country profiles for all UN-recognized states, served from static JSON files
            with a single Vercel-compatible API for country detail lookup.
          </p>
          <div class="hero-meta">
            <div class="hero-stat">
              <strong id="totalCountries">195</strong>
              <span>UN countries tracked</span>
            </div>
            <div class="hero-stat">
              <strong>1</strong>
              <span>Serverless function</span>
            </div>
            <div class="hero-stat">
              <strong id="activeContinentLabel">All</strong>
              <span>Current filter</span>
            </div>
          </div>
        </article>
        <aside class="map-card">
          <h2>World coverage</h2>
          <div class="map-frame">
            <img src="/assets/world-map.svg" alt="World map" />
          </div>
          <p class="hero-copy">
            Explore the dataset by continent, search by country name, then load the full risk
            sheet from <code>/api/country/[country]</code>.
          </p>
        </aside>
      </section>

      <section class="layout">
        <aside class="panel">
          <h2>Find a country</h2>
          <input id="countrySearch" class="search-input" type="search" placeholder="Search France, Japan, Brazil..." />
          <div id="continentFilters" class="chip-row"></div>
          <div id="countryList" class="country-list"></div>
        </aside>

        <section class="details" id="countryDetails">
          <article class="panel empty-state">
            Select a country to load its geopolitical profile.
          </article>
        </section>
      </section>
    </main>
  `;
}

export function renderCountryList(entries, activeSlug) {
  if (!entries.length) {
    return `<div class="empty-state">No countries match the current search.</div>`;
  }

  return entries
    .map(
      (entry) => `
        <button class="country-card${entry.slug === activeSlug ? " active" : ""}" data-country="${entry.slug}" type="button">
          <strong>${entry.name}</strong>
          <span>${entry.continent}</span>
        </button>
      `
    )
    .join("");
}

export function renderContinentFilters(continents, activeContinent) {
  return continents
    .map(
      (continent) => `
        <button
          class="chip${continent === activeContinent ? " active" : ""}"
          data-continent="${continent}"
          type="button"
        >
          ${continent}
        </button>
      `
    )
    .join("");
}

export function renderCountryDetails(profile) {
  const meter = profile.risk_barometer;
  const facts = [
    ["Capital", profile.key_data.capital],
    ["Population", profile.key_data.population],
    ["Political system", profile.key_data.political_system],
    ["Head of state", profile.key_data.head_of_state],
    ["GDP", profile.key_data.gdp],
    ["GDP per capita", profile.key_data.gdp_per_capita],
    ["Growth", profile.key_data.growth],
    ["Inflation", profile.key_data.inflation],
    ["Public debt", profile.key_data.public_debt],
    ["Unemployment", profile.key_data.unemployment],
    ["HDI", profile.key_data.hdi],
    ["Corruption index", profile.key_data.corruption_index]
  ];

  const analysis = [
    ["Security", profile.analysis.security],
    ["Geopolitics", profile.analysis.geopolitics],
    ["Politics", profile.analysis.politics],
    ["Economy", profile.analysis.economy],
    ["Crime", profile.analysis.crime],
    ["Terrorism", profile.analysis.terrorism],
    ["Health & disasters", profile.analysis.health_disasters],
    ["Transport", profile.analysis.transport],
    ["Regional analysis", profile.analysis.regional_analysis],
    ["Summary", profile.analysis.summary]
  ];

  return `
    <article class="hero-card">
      <div class="details-header">
        <div>
          <span class="eyebrow">${profile.continent}</span>
          <h2>${profile.name}</h2>
          <p>${profile.analysis.summary}</p>
        </div>
        <div class="risk-pill">
          <span>Risk</span>
          <strong>${profile.risk_global}/5</strong>
        </div>
      </div>
    </article>

    <section class="metrics">
      ${Object.entries(meter)
        .map(
          ([key, value]) => `
            <article class="metric">
              <span>${key.replace(/_/g, " ")}</span>
              <strong>${value}/5</strong>
            </article>
          `
        )
        .join("")}
    </section>

    <section class="facts-grid">
      ${facts
        .map(
          ([label, value]) => `
            <article class="fact-card">
              <h3>${label}</h3>
              <p>${value}</p>
            </article>
          `
        )
        .join("")}
    </section>

    <section class="analysis-grid">
      ${analysis
        .map(
          ([label, value]) => `
            <article class="analysis-card">
              <h3>${label}</h3>
              <p>${value}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}
