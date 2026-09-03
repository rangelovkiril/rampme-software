import { describe, expect, it } from 'bun:test'
import { decodeFeedMessage } from '../../src/gtfs/realtime'

const fixturePath = `${import.meta.dir}/../fixtures/gtfs-rt.bin`

describe('decodeFeedMessage', () => {
  it('decodes a vehicle-position entity with its position and trip/vehicle descriptors', async () => {
    const buf = new Uint8Array(await Bun.file(fixturePath).arrayBuffer())
    const decoded = decodeFeedMessage(buf)

    expect(decoded.entity).toHaveLength(2)
    const vp = decoded.entity?.find((e) => e.id === 'vp-1')
    expect(vp?.vehicle?.trip?.tripId).toBe('T1')
    expect(vp?.vehicle?.trip?.routeId).toBe('R1')
    expect(vp?.vehicle?.vehicle?.id).toBe('V1')
    expect(vp?.vehicle?.position?.latitude).toBeCloseTo(42.6, 3)
    expect(vp?.vehicle?.position?.longitude).toBeCloseTo(23.3, 3)
    expect(vp?.vehicle?.currentStopSequence).toBe(1)
  })

  it('decodes a trip-update entity with its stop_time_update', async () => {
    const buf = new Uint8Array(await Bun.file(fixturePath).arrayBuffer())
    const decoded = decodeFeedMessage(buf)

    const tu = decoded.entity?.find((e) => e.id === 'tu-1')
    expect(tu?.tripUpdate?.trip?.tripId).toBe('T1')
    expect(tu?.tripUpdate?.stopTimeUpdate).toHaveLength(1)
    expect(tu?.tripUpdate?.stopTimeUpdate?.[0].stopId).toBe('S2')
    expect(tu?.tripUpdate?.stopTimeUpdate?.[0].stopSequence).toBe(2)
    expect(tu?.tripUpdate?.stopTimeUpdate?.[0].arrival?.delay).toBe(60)
  })
})
