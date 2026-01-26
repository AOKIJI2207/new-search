import { getCountryProfiles } from "./country-profiles-service.js";

export default async function handler(req, res) {
  try {
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const payload = await getCountryProfiles({ forceRefresh });
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: "Impossible de récupérer les profils pays.",
      details: String(error?.message || error)
    });
  }
}
