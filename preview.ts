#!/usr/bin/env bun
/**
 * Serves the static `dist/` build locally for testing before deploying
 * to Netlify / Vercel / S3. Plain file server, no processing.
 *
 * Usage: bun run preview
 */

const port = Number(process.argv[2]) || 3001
const distDir = 'dist'

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // Map directory roots and extensionless routes to .html files
    // (Netlify's Pretty URLs mode does the same: /about → /about.html)
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html'
    }
    else if (!pathname.includes('.')) {
      pathname = pathname.replace(/\/$/, '') + '.html'
    }

    const filePath = `${distDir}${pathname}`
    const file = Bun.file(filePath)

    if (await file.exists()) {
      return new Response(file)
    }

    // Fallback to 404.html
    const notFound = Bun.file(`${distDir}/404.html`)
    if (await notFound.exists()) {
      return new Response(notFound, { status: 404 })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[preview] serving ./${distDir} at http://localhost:${port}`)
