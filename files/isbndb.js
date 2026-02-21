export default async function handler(req, res) {
  const { q, pageSize = 8, type = "books" } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q= parameter" });

  const key = process.env.ISBNDB_API_KEY;
  if (!key) return res.status(500).json({ error: "ISBNDB_API_KEY not set" });

  // Support both /books/:query and /author/:name endpoints
  const endpoint = type === "author"
    ? `https://api2.isbndb.com/author/${encodeURIComponent(q)}?pageSize=${pageSize}`
    : `https://api2.isbndb.com/books/${encodeURIComponent(q)}?pageSize=${pageSize}`;

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: key }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
