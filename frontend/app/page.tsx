'use client'

import dynamic from 'next/dynamic'

const CityMap = dynamic(() => import('@/components/Map'), { ssr: false })

export default function Home() {
  return <CityMap />
}
