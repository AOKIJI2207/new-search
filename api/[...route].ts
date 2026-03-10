import { handleHubRequest } from "../server/api-router.js";

export default async function handler(req, res) {
  await handleHubRequest(req, res);
}
