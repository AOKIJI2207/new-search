import crypto from "node:crypto";
import { loadCountryProfileBySlug, slugify } from "../../server/country-store.js";

export default async function handler(req, res) {
  const countryParam = Array.isArray(req.query.country) ? req.query.country[0] : req.query.country;
  const slug = slugify(String(countryParam || ""));

  if (!slug) {
    res.status(400).json({ error: "Missing country parameter" });
    return;
  }

  const profile = loadCountryProfileBySlug(slug);
  if (!profile) {
    res.status(404).json({ error: `Country not found: ${slug}` });
    return;
  }

  const body = JSON.stringify(profile);
  const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex")}"`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400");
  res.setHeader("ETag", etag);

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.status(200).send(body);
}
