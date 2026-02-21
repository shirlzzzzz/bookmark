export default async function handler(req, res) {
  try {
    const { path = [] } = req.query; // catch-all
    const upstreamPath = Array.isArray(path) ? path.join("/") : String(path);

    const apiKey = process.env.ISBNDB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ISBNDB_API_KEY" });
    }

    // Build upstream URL: https://api2.isbndb.com/{path}?{query}
    const qs = new URLSearchParams(req.query);
    qs.delete("path"); // remove catch-all
    const queryString = qs.toString();
    const url = `https://api2.isbndb.com/${upstreamPath}${queryString ? `?${queryString}` : ""}`;

    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: apiKey,
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();

    // Pass through status + content-type
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");

    // If it's JSON, return JSON; otherwise return raw text
    if ((upstream.headers.get("content-type") || "").includes("application/json")) {
      return res.send(text);
    }
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
