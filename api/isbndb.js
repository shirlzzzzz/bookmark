export default async function handler(req, res) {
  const key = process.env.ISBNDB_API_KEY;
  if (!key) return res.status(500).json({ error: "ISBNDB_API_KEY not set" });

  // req.url will be like /api/isbndb?endpoint=/books/harry%20potter&pageSize=8&language=en
  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint param" });

  const qs = new URLSearchParams(params).toString();
  const url = `https://api2.isbndb.com${endpoint}${qs ? "?" + qs : ""}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: key },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
