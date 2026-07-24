'use client'

import dynamic from 'next/dynamic'
import { RampProvider } from '@/contexts/RampContext'
import MissedBusAlert from '@/components/MissedBusAlert'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

export default function HomePage() {
  return (
    <RampProvider>
      <Map />
      <MissedBusAlert />
    </RampProvider>
  )
}
