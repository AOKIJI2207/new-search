export const DATA_UNAVAILABLE = "Data unavailable";

export const TRUSTED_NEWS_PUBLISHERS = new Set([
  "AP News",
  "Associated Press",
  "BBC",
  "BBC News",
  "Bloomberg",
  "Financial Times",
  "IMF",
  "Reuters",
  "The Economist",
  "United Nations",
  "World Bank",
  "World Health Organization"
]);

export const SOURCE_CATALOG = {
  worldBank: {
    category: "Macroeconomy",
    label: "World Bank",
    referenceLabel: "World Development Indicators",
    url: "https://api.worldbank.org/v2/sources/2"
  },
  worldBankCountry: {
    category: "Country metadata",
    label: "World Bank",
    referenceLabel: "Country API metadata",
    url: "https://api.worldbank.org/v2/country"
  },
  worldBankWits: {
    category: "Country metadata",
    label: "World Bank",
    referenceLabel: "WITS country metadata",
    url: "https://wits.worldbank.org/CountryProfile/Metadata/en/Country/All"
  },
  imf: {
    category: "Macroeconomy",
    label: "IMF",
    referenceLabel: "DataMapper",
    url: "https://www.imf.org/external/datamapper"
  },
  undp: {
    category: "Human development",
    label: "UNDP",
    referenceLabel: "Human Development Reports",
    url: "https://hdr.undp.org/data-center/human-development-index"
  },
  freedomHouse: {
    category: "Risk",
    label: "Freedom House",
    referenceLabel: "Freedom in the World",
    url: "https://freedomhouse.org/countries/freedom-world/scores"
  }
};

function parseNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePublisherName(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function isIsoDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
}

function toIsoDate(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (isIsoDate(raw)) {
    return raw;
  }

  if (/^\d{4}$/.test(raw)) {
    return `${raw}-12-31`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseCountryMetric(value) {
  return parseNumericValue(value);
}

export function validateCountryMetric(field, value, { countryName = "", warn = false } = {}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = parseNumericValue(value);
  let valid = Number.isFinite(numericValue);

  if (valid) {
    switch (field) {
      case "hdi":
        valid = numericValue >= 0 && numericValue <= 1;
        break;
      case "unemployment":
        valid = numericValue >= 0 && numericValue <= 100;
        break;
      case "inflation":
        valid = numericValue >= -50 && numericValue <= 500;
        break;
      case "gdp":
      case "gdpPerCapita":
      case "population":
        valid = numericValue > 0;
        break;
      case "growth":
        valid = Number.isFinite(numericValue);
        break;
      default:
        valid = Number.isFinite(numericValue);
        break;
    }
  }

  if (!valid) {
    if (warn && process.env.NODE_ENV !== "production") {
      console.warn(`Discarding invalid ${field} value for ${countryName || "unknown country"}:`, value);
    }
    return null;
  }

  return numericValue;
}

export function normalizeCountrySources(entries = []) {
  const grouped = new Map();

  for (const entry of entries) {
    if (!entry?.sourceId || !Array.isArray(entry.fields) || !entry.fields.length) {
      continue;
    }

    const source = SOURCE_CATALOG[entry.sourceId];
    if (!source) {
      continue;
    }

    const updatedAt = toIsoDate(entry.updatedAt || entry.year || "");
    const key = `${entry.sourceId}:${updatedAt}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        category: source.category,
        label: source.label,
        referenceLabel: source.referenceLabel,
        url: source.url,
        updatedAt,
        fields: new Set()
      });
    }

    const bucket = grouped.get(key);
    for (const field of entry.fields) {
      bucket.fields.add(field);
    }
  }

  return [...grouped.values()]
    .map((entry) => ({
      category: entry.category,
      label: entry.label,
      referenceLabel: entry.referenceLabel,
      url: entry.url,
      updatedAt: entry.updatedAt || undefined,
      fields: [...entry.fields].sort()
    }))
    .sort((left, right) => {
      const leftDate = left.updatedAt || "";
      const rightDate = right.updatedAt || "";
      return rightDate.localeCompare(leftDate) || left.label.localeCompare(right.label);
    });
}

function isTrustedPublisher(publisher, url) {
  const normalizedPublisher = normalizePublisherName(publisher);
  if (TRUSTED_NEWS_PUBLISHERS.has(normalizedPublisher)) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return [
      "apnews.com",
      "bbc.com",
      "bloomberg.com",
      "economist.com",
      "ft.com",
      "imf.org",
      "reuters.com",
      "un.org",
      "worldbank.org",
      "who.int"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (_error) {
    return false;
  }
}

export function normalizeCountryNews(articles = []) {
  const deduped = new Map();

  for (const article of articles) {
    const title = String(article?.title || "").trim();
    const url = String(article?.url || "").trim();
    if (!title || !url) {
      continue;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_error) {
      continue;
    }

    if (!/^https?:$/.test(parsedUrl.protocol)) {
      continue;
    }

    const publisher = normalizePublisherName(article.publisher || "");
    if (!isTrustedPublisher(publisher, parsedUrl.toString())) {
      continue;
    }

    const publishedAt = toIsoDate(article.publishedAt || "");
    const key = `${title.toLowerCase()}::${parsedUrl.toString()}`;
    deduped.set(key, {
      title,
      publisher: publisher || undefined,
      publishedAt: publishedAt || undefined,
      url: parsedUrl.toString(),
      summary: String(article.summary || "").trim() || undefined,
      imageUrl: String(article.imageUrl || "").trim() || undefined
    });
  }

  return [...deduped.values()].sort((left, right) => (right.publishedAt || "").localeCompare(left.publishedAt || ""));
}

export function buildCountryLastUpdated(sources = [], fallbackDate = "") {
  const dates = sources
    .map((source) => toIsoDate(source.updatedAt || ""))
    .filter(Boolean)
    .sort()
    .reverse();

  return dates[0] || toIsoDate(fallbackDate) || new Date().toISOString().slice(0, 10);
}

export function createEmptyCountryProfile({ code, slug, name, continent }) {
  return {
    code,
    slug,
    name,
    continent,
    region: null,
    incomeGroup: null,
    currency: null,
    lastUpdated: null,
    metrics: {
      population: null,
      gdp: null,
      gdpPerCapita: null,
      growth: null,
      inflation: null,
      unemployment: null,
      hdi: null
    },
    risk: {
      global: null,
      political: null,
      economic: null,
      social: null,
      fiscal: null
    },
    sources: [],
    news: []
  };
}
