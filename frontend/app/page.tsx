'use client'

import dynamic from 'next/dynamic'

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <p className="text-on-surface-variant text-sm">Loading map...</p>
    </div>
  )
})

/**
 * Renders the page's Map component.
 *
 * @returns The React element for the page that displays the Map component.
 */
export default function Home() {
  return <Map />
}
