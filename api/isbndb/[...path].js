export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    message: "catch-all hit",
    url: req.url,
    method: req.method
  });
}
