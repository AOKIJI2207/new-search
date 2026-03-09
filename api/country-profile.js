import fs from "node:fs";
import path from "node:path";

const PROFILES_DIR = path.join(process.cwd(), "country_profiles", "data", "profiles");

function loadProfileByCountryName(countryName) {
  const files = fs.readdirSync(PROFILES_DIR).filter((name) => name.endsWith(".json"));
  const target = countryName.trim().toLowerCase();

  for (const file of files) {
    const fullPath = path.join(PROFILES_DIR, file);
    const profile = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    if ((profile.country || "").toLowerCase() === target) {
      return profile;
    }
  }

  return null;
}

export default function handler(req, res) {
  const country = String(req.query.country || "").trim();
  if (!country) {
    return res.status(400).json({ error: "Missing country query parameter" });
  }

  try {
    const profile = loadProfileByCountryName(country);
    if (!profile) {
      return res.status(404).json({ error: `Country profile not found for ${country}` });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify(profile));
  } catch (error) {
    return res.status(500).json({ error: "Unable to load country profile", details: String(error) });
  }
}
