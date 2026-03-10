import { renderAppShell, renderContinentFilters, renderCountryDetails, renderCountryList } from "../pages/home-page.js";

const state = {
  countriesByContinent: {},
  countries: [],
  query: "",
  activeContinent: "All",
  activeSlug: null,
  profileCache: new Map()
};

const CONTINENT_ORDER = [
  "All",
  "Afrique",
  "Amérique du Nord",
  "Amérique du Sud",
  "Asie",
  "Europe",
  "Océanie",
  "Antarctique"
];

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .trim();
}

function getVisibleCountries() {
  return state.countries.filter((country) => {
    const matchesContinent = state.activeContinent === "All" || country.continent === state.activeContinent;
    const matchesQuery = !state.query || country.name.toLowerCase().includes(state.query.toLowerCase());
    return matchesContinent && matchesQuery;
  });
}

async function loadCountryProfile(slug) {
  if (state.profileCache.has(slug)) {
    return state.profileCache.get(slug);
  }

  const response = await fetch(`/api/country/${slug}`);
  if (!response.ok) {
    throw new Error(`Unable to load country profile: ${slug}`);
  }

  const profile = await response.json();
  state.profileCache.set(slug, profile);
  return profile;
}

async function renderDetails() {
  const target = document.querySelector("#countryDetails");
  if (!state.activeSlug) {
    target.innerHTML = `
      <article class="panel empty-state">
        Select a country to load its geopolitical profile.
      </article>
    `;
    return;
  }

  target.innerHTML = `
    <article class="panel empty-state">Loading country profile…</article>
  `;

  try {
    const profile = await loadCountryProfile(state.activeSlug);
    target.innerHTML = renderCountryDetails(profile);
  } catch (_error) {
    target.innerHTML = `
      <article class="panel empty-state">
        Country profile unavailable for this selection.
      </article>
    `;
  }
}

function renderSidebar() {
  document.querySelector("#continentFilters").innerHTML = renderContinentFilters(CONTINENT_ORDER, state.activeContinent);
  document.querySelector("#countryList").innerHTML = renderCountryList(getVisibleCountries(), state.activeSlug);
  document.querySelector("#activeContinentLabel").textContent = state.activeContinent;

  document.querySelectorAll("[data-continent]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeContinent = button.dataset.continent;
      renderSidebar();
    });
  });

  document.querySelectorAll("[data-country]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeSlug = button.dataset.country;
      renderSidebar();
      await renderDetails();
    });
  });
}

async function boot() {
  document.querySelector("#app").innerHTML = renderAppShell();
  const response = await fetch("/data/countries.json");
  const countriesByContinent = await response.json();
  state.countriesByContinent = countriesByContinent;
  state.countries = Object.entries(countriesByContinent)
    .flatMap(([continent, names]) => names.map((name) => ({ name, continent, slug: slugify(name) })))
    .sort((left, right) => left.name.localeCompare(right.name));

  document.querySelector("#totalCountries").textContent = String(state.countries.length);
  document.querySelector("#countrySearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderSidebar();
  });

  state.activeSlug = state.countries[0]?.slug || null;
  renderSidebar();
  await renderDetails();
}

boot().catch((error) => {
  document.querySelector("#app").innerHTML = `
    <main class="app-shell">
      <article class="panel empty-state">
        ${error.message}
      </article>
    </main>
  `;
});
