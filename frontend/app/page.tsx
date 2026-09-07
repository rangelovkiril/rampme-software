'use client'

import dynamic from 'next/dynamic'
import MissedBusAlert from '@/components/MissedBusAlert'
import { RampProvider } from '@/contexts/RampContext'

const MapView = dynamic(() => import('@/components/Map'), { ssr: false })

export default function HomePage() {
  return (
    <RampProvider>
      <MapView />
      <MissedBusAlert />
    </RampProvider>
  )
}
