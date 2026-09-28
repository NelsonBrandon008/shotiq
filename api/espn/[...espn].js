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
    // ESPN's undocumented API responds differently to obvious server/bot
    // traffic (a generic "SMCShotCharts/1.0" UA got a bare 404 from
    // Vercel's serverless IPs even on a URL confirmed to work fine from
    // elsewhere) than to something that looks like an ordinary browser
    // hitting espn.com. A full modern-Chrome header set fixes it.
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
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.send(body)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ESPN', detail: String(err) })
  }
}
