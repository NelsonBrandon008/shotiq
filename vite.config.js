import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During local dev, requests to /api/espn are proxied straight to ESPN's
// undocumented site.api.espn.com host so you don't hit CORS errors while
// running `npm run dev`. In production (Vercel), the same /api/espn path
// is served by api/espn.js as a serverless function that does the same
// proxying server-side.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/espn-core': {
        target: 'https://sports.core.api.espn.com',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/espn-core/, '/v2/sports/basketball/leagues/mens-college-basketball'),
      },
      '/api/espn': {
        target: 'https://site.api.espn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/espn/, '/apis/site/v2/sports/basketball/mens-college-basketball')
      }
    }
  }
})
