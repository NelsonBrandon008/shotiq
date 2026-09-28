// Proxies to https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/<path>
// Same reasoning as api/espn/[...espn].js — dodges browser CORS on a
// second undocumented ESPN host that serves full-season team stat totals.

export default async function handler(req, res) {
  const { path: pathParts = [] } = req.query
  const path = Array.isArray(pathParts) ? pathParts.join('/') : pathParts

  const search = new URLSearchParams(req.query)
  search.delete('path')

  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/${path}${
    search.toString() ? `?${search.toString()}` : ''
  }`

  try {
    // Same fix as api/espn/[...espn].js — a generic/obviously-server UA
    // gets a bare 404 from this host when called from Vercel's serverless
    // IPs; a real-browser header set fixes it.
    const espnRes = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.espn.com/',
        Origin: 'https://www.espn.com',
      },
    })
    const body = await espnRes.text()
    res.status(espnRes.status)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600')
    res.send(body)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ESPN core API', detail: String(err) })
  }
}
