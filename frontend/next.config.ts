import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export',
  // Dev-only: proxies /api/* to a local backend, replacing the deleted proxy
  // route. Ignored by `next build` (NODE_ENV=production), so it never
  // conflicts with output:'export'.
  ...(process.env.NODE_ENV === 'development' && {
    rewrites: async () => [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/:path*`,
      },
    ],
  }),
}

export default nextConfig
