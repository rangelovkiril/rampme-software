import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RampMe',
    short_name: 'RampMe',
    description: 'Карта на градския транспорт в София с достъпност за рампа',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#BE1E2D',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
