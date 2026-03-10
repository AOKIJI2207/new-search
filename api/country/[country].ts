import { handleCountryRequest } from "../../server/api-router.js";

export default async function handler(req, res) {
  await handleCountryRequest(req, res);
}
