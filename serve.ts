import { serve } from 'bun-plugin-stx/serve'

const PORT = parseInt(process.env.PORT || '3000')

async function onRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const pathname = url.pathname

  if (!pathname.startsWith('/api/')) return null

  return Response.json({ error: 'Not found' }, { status: 404 })
}

await serve({
  patterns: ['resources/views/'],
  port: PORT,
  layoutsDir: 'resources/layouts',
  partialsDir: 'resources/components',
  onRequest,
})
