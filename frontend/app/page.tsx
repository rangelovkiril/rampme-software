'use client'

import dynamic from 'next/dynamic'
import { RampProvider } from '@/contexts/RampContext'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

export default function HomePage() {
  return (
    <RampProvider>
      <Map />
    </RampProvider>
  )
}
