import { type NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000'

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const { search } = new URL(request.url)
  const backendUrl = `${BACKEND_URL}/${path.join('/')}${search}`

  let body: BodyInit | null = null
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer()
  }

  const upstream = await fetch(backendUrl, {
    method: request.method,
    headers: request.headers,
    body: body ?? undefined,
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
