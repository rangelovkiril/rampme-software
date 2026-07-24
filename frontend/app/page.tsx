'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { RampProvider } from '@/contexts/RampContext'
import MissedBusAlert from '@/components/MissedBusAlert'
import { loadRuntimeConfig } from '@/lib/config'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

export default function HomePage() {
  const [configReady, setConfigReady] = useState(false)

  useEffect(() => {
    loadRuntimeConfig().then(() => setConfigReady(true))
  }, [])

  if (!configReady) return null

  return (
    <RampProvider>
      <Map />
      <MissedBusAlert />
    </RampProvider>
  )
}
