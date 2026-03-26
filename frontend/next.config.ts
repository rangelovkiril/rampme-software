import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'BACKEND_URL/:path*',
      },
    ]
  },
}

export default nextConfig
