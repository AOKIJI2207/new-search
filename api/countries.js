import { loadCountryCatalog } from "./country-data.js";

export default function handler(req, res) {
  try {
    const countries = loadCountryCatalog();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({ count: countries.length, countries }));
  } catch (error) {
    res.status(500).json({ error: "Unable to load countries", details: String(error) });
  }
}
