import { buildAndCacheProfiles } from "./country-profiles-service.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée." });
    return;
  }
  try {
    const payload = await buildAndCacheProfiles();
    res.status(200).json({
      status: "refreshed",
      updatedAt: payload.updatedAt
    });
  } catch (error) {
    res.status(500).json({
      error: "Impossible de rafraîchir les profils pays.",
      details: String(error?.message || error)
    });
  }
}
