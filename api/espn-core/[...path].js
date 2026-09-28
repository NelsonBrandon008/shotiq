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
    const espnRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; D1ShotCharts/1.0)' },
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
