export default async function handler(req, res) {
  try {
    const apiKey = process.env.ISBNDB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ISBNDB_API_KEY in env" });
    }

    // Catch-all segment can be string or array depending on how Vercel parses it
    const raw = req.query.path;
    const parts = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const upstreamPath = parts.join("/"); // e.g. "book/978..."

    // Preserve query string params except "path"
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      if (Array.isArray(v)) v.forEach(val => qs.append(k, val));
      else if (v !== undefined) qs.append(k, v);
    }

    const url =
      `https://api2.isbndb.com/${upstreamPath}` + (qs.toString() ? `?${qs}` : "");

    const r = await fetch(url, {
      headers: {
        Authorization: apiKey,
        Accept: "application/json"
      }
    });

    const text = await r.text();
    res.status(r.status);

    // Try JSON, fall back to raw text
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
