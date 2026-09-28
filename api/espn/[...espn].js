// Vercel serverless function: GET /api/espn/<path>?...
// Proxies to https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/<path>
//
// This exists purely to dodge browser CORS restrictions when calling ESPN's
// undocumented API from a deployed static site. Nothing here is
// Saint-Mary's-specific — it's a generic pass-through.

export default async function handler(req, res) {
  const { espn = [] } = req.query
  const path = Array.isArray(espn) ? espn.join('/') : espn

  const search = new URLSearchParams(req.query)
  search.delete('espn')

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/${path}${
    search.toString() ? `?${search.toString()}` : ''
  }`

  try {
    const espnRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMCShotCharts/1.0)' },
    })
    const body = await espnRes.text()
    res.status(espnRes.status)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.send(body)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ESPN', detail: String(err) })
  }
}
