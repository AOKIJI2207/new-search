import crypto from "crypto";
import sources from "./sources-data.js";

export default function handler(req, res) {
  const body = JSON.stringify(sources);
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
