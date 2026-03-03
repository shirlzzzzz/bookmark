// api/google-books.js
// Vercel serverless function — proxies Google Books API so the key stays server-side

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q, maxResults = 8 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY; // server-side only — no VITE_ prefix
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(Math.min(Number(maxResults), 20)));
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Google Books API error' });
    }
    const data = await response.json();
    // Cache for 10 minutes on CDN
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Google Books proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
