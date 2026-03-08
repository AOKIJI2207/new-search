import crypto from "crypto";
import { getCountryProfiles } from "./country-profiles-service.js";

const CONTINENTS = ["Afrique","Amérique du Nord","Amérique du Sud","Asie","Europe","Océanie","Antarctique"];

function slugify(v = "") {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .trim();
}

export default async function handler(req, res) {
  try {
    const payload = await getCountryProfiles();
    const countries = Object.values(payload.profiles || {}).map(p => ({
      name: p.country,
      slug: slugify(p.country),
      continent: p.continent
    }));
    const out = {
      updatedAt: payload.updatedAt,
      countries,
      continents: CONTINENTS.map(name => ({ name, slug: slugify(name) }))
    };
    const body = JSON.stringify(out);
    const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex")}"`;
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).json(out);
  } catch (error) {
    res.status(500).json({ error: "Index recherche indisponible", details: String(error?.message || error) });
  }
}
