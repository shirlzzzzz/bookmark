export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    catchAll: true,
    url: req.url,
    method: req.method,
    query: req.query
  });
}
