import { findCountryEntry, loadCountryCatalog, loadCountryProfiles } from "./country-data.js";

export default function handler(req, res) {
  const query = String(req.query.country || req.query.id || req.query.iso3 || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing country query parameter" });
  }

  try {
    const catalog = loadCountryCatalog();
    const entry = findCountryEntry(query, catalog);
    if (!entry) {
      return res.status(404).json({ error: `Country profile not found for ${query}` });
    }

    const profiles = loadCountryProfiles();
    const profile = profiles[entry.iso3];
    if (!profile) {
      return res.status(404).json({ error: `Country profile not found for ${query}` });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify({
      ...profile,
      catalog: entry
    }));
  } catch (error) {
    return res.status(500).json({ error: "Unable to load country profile", details: String(error) });
  }
}
