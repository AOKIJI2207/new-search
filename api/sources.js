export default function handler(req, res) {
  const sources = [
    { key: "bbc_world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", enabledByDefault: true },
    { key: "bbc_sci", name: "BBC Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", enabledByDefault: true },
    { key: "guardian_world", name: "The Guardian World", url: "https://www.theguardian.com/world/rss", enabledByDefault: true },
    { key: "guardian_tech", name: "The Guardian Technology", url: "https://www.theguardian.com/uk/technology/rss", enabledByDefault: true },
    { key: "france24", name: "France24 (EN)", url: "https://www.france24.com/en/rss", enabledByDefault: true }
  ];

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(sources));
}
