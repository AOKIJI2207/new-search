import crypto from "crypto";
import { getCountryProfiles } from "./country-profiles-service.js";

export default async function handler(req, res) {
  try {
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const payload = await getCountryProfiles({ forceRefresh });
    const body = JSON.stringify(payload);
    const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex")}"`;
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: "Impossible de récupérer les profils pays.",
      details: String(error?.message || error)
    });
  }
}
