import fs from "node:fs";
import path from "node:path";

const COUNTRIES_PATH = path.join(process.cwd(), "country_profiles", "data", "countries.json");

export default function handler(req, res) {
  try {
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_PATH, "utf-8"));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({ count: countries.length, countries }));
  } catch (error) {
    res.status(500).json({ error: "Unable to load countries", details: String(error) });
  }
}
