import crypto from "crypto";

export const ALLOWED_CATEGORIES = [
  { key: "securite_interieure", label: "Sécurité intérieure" },
  { key: "securite_exterieure", label: "Sécurité extérieure" },
  { key: "situation_sanitaire", label: "Situation sanitaire" },
  { key: "situations_geographiques", label: "Situations géographiques" },
  { key: "actualites_politiques", label: "Actualités politiques" }
];

const CONTINENT_BY_COUNTRY = {
  Nigeria: "Afrique","South Africa": "Afrique",Kenya: "Afrique",Egypt: "Afrique",Morocco: "Afrique",Ghana: "Afrique",Senegal: "Afrique",
  "United States": "Amérique du Nord",Canada: "Amérique du Nord",Mexico: "Amérique du Nord",
  Brazil: "Amérique du Sud",Argentina: "Amérique du Sud",Colombia: "Amérique du Sud",Chile: "Amérique du Sud",Peru: "Amérique du Sud",
  China: "Asie",India: "Asie",Japan: "Asie","South Korea": "Asie",Indonesia: "Asie",Pakistan: "Asie",
  France: "Europe",Germany: "Europe","United Kingdom": "Europe",Italy: "Europe",Spain: "Europe",Ukraine: "Europe",Russia: "Europe",
  Australia: "Océanie","New Zealand": "Océanie"
};

const COUNTRY_KEYWORDS = {
  Nigeria: ["nigeria","nigerian","abuja","lagos"],
  "South Africa": ["south africa","south african","johannesburg","pretoria","cape town"],
  Kenya: ["kenya","kenyan","nairobi"],
  Egypt: ["egypt","egyptian","cairo"],
  Morocco: ["morocco","moroccan","rabat","casablanca"],
  Ghana: ["ghana","ghanaian","accra"],
  Senegal: ["senegal","senegalese","dakar"],
  "United States": ["united states","usa","u.s.","washington","new york","america","american"],
  Canada: ["canada","canadian","ottawa","toronto"],
  Mexico: ["mexico","mexican","mexico city"],
  Brazil: ["brazil","brazilian","brasil","brasilia","rio","sao paulo","são paulo"],
  Argentina: ["argentina","argentine","buenos aires"],
  Colombia: ["colombia","colombian","bogota","bogotá"],
  Chile: ["chile","chilean","santiago"],
  Peru: ["peru","peruvian","lima"],
  China: ["china","chinese","beijing","peking"],
  India: ["india","indian","new delhi","delhi"],
  Japan: ["japan","japanese","tokyo"],
  "South Korea": ["south korea","korea","seoul"],
  Indonesia: ["indonesia","indonesian","jakarta"],
  Pakistan: ["pakistan","pakistani","islamabad"],
  France: ["france","french","paris"],
  Germany: ["germany","german","berlin","deutschland"],
  "United Kingdom": ["united kingdom","uk","britain","british","london"],
  Italy: ["italy","italian","rome","roma"],
  Spain: ["spain","spanish","madrid"],
  Ukraine: ["ukraine","ukrainian","kyiv","kiev"],
  Russia: ["russia","russian","moscow","moskva"],
  Australia: ["australia","australian","canberra","sydney","melbourne"],
  "New Zealand": ["new zealand","kiwi","wellington","auckland"]
};

export function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectLanguage(text) {
  const input = text || "";
  if (!input.trim()) return "und";
  const latin = (input.match(/[a-zA-Z]/g) || []).length;
  const frenchHints = (norm(input).match(/\b(le|la|les|des|dans|avec|pour|contre|gouvernement|election|securite|sante)\b/g) || []).length;
  if (frenchHints >= 2) return "fr";
  if (latin > 0) return "en";
  return "und";
}

const CATEGORY_RULES = {
  securite_interieure: ["police","crime","criminalite","gang","terrorisme","attentat","violence","cyberattaque","cybersecurity","public safety","interior ministry"],
  securite_exterieure: ["defense","military","armee","navy","air force","conflit","war","frontiere","border","otan","nato","diplomatie","sanction"],
  situation_sanitaire: ["sante","health","hopital","hospital","epidemie","pandemie","vaccine","vaccin","disease","cholera","ebola"],
  situations_geographiques: ["seisme","earthquake","flood","inondation","cyclone","hurricane","wildfire","incendie","landslide","eruption","drought","canicule"],
  actualites_politiques: ["gouvernement","government","parlement","parliament","election","vote","president","prime minister","cabinet","senate","assemblee","party"]
};

export function classifyArticle(text) {
  const corpus = norm(text);
  const scores = ALLOWED_CATEGORIES.map(cat => {
    const terms = CATEGORY_RULES[cat.key] || [];
    const score = terms.reduce((acc, term) => acc + (corpus.includes(norm(term)) ? 1 : 0), 0);
    return { ...cat, score };
  }).sort((a, b) => b.score - a.score);

  if (!scores[0] || scores[0].score === 0) return null;
  if (scores[1] && scores[0].score === scores[1].score) {
    const priority = ["securite_exterieure", "securite_interieure", "situation_sanitaire", "situations_geographiques", "actualites_politiques"];
    scores.sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));
  }
  return { key: scores[0].key, label: scores[0].label };
}

export function identifyCountryAndEntities(text) {
  const corpus = norm(text);
  const entities = [];
  let bestCountry = null;
  let bestHits = 0;

  Object.entries(COUNTRY_KEYWORDS).forEach(([country, words]) => {
    const hits = words.reduce((acc, word) => acc + (corpus.includes(norm(word)) ? 1 : 0), 0);
    if (hits > 0) {
      entities.push(country);
      if (hits > bestHits) {
        bestHits = hits;
        bestCountry = country;
      }
    }
  });

  const actorTerms = ["otan", "onu", "union europeenne", "nato", "eu", "kremlin", "white house", "elysee", "pentagon"];
  actorTerms.forEach(actor => {
    if (corpus.includes(norm(actor))) entities.push(actor.toUpperCase());
  });

  return { country: bestCountry, continent: bestCountry ? CONTINENT_BY_COUNTRY[bestCountry] || null : null, entities: Array.from(new Set(entities)).slice(0, 8) };
}

export function toArticleRecord(item, source) {
  const title = item.title || "";
  const summary = (item.contentSnippet || item.summary || item.content || "").slice(0, 360);
  const content = (item.content || item.summary || item.contentSnippet || "").slice(0, 3000);
  const combined = [title, summary, content, source.name].join(" ");
  const category = classifyArticle(combined);
  if (!category) return null;
  const { country, continent, entities } = identifyCountryAndEntities(combined);
  const language_detected = detectLanguage(`${title} ${summary}`);

  return {
    title,
    source: source.name,
    sourceKey: source.key,
    date: item.isoDate || item.pubDate || "",
    url: item.link || "",
    summary,
    language_detected,
    category: category.key,
    category_label: category.label,
    country,
    continent,
    entities,
    content
  };
}

export function hashKey(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
