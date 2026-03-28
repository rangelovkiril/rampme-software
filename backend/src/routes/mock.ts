import { Elysia } from 'elysia'
import { getMockBusEntity, getMockBusStatus, MOCK_BUS_ID } from '../services/mock-bus'

export const mockRoutes = new Elysia({ prefix: '/mock' })
  .get('/bus', () => getMockBusStatus(), {
    detail: { tags: ['Mock'], summary: 'Mock bus live status & loop info' },
  })
  .get('/bus/entity', () => getMockBusEntity(), {
    detail: { tags: ['Mock'], summary: 'Raw GTFS-RT entity for the mock bus' },
  })
  .get('/bus/id', () => ({ vehicle_id: MOCK_BUS_ID }), {
    detail: {
      tags: ['Mock'],
      summary: 'Vehicle ID of the mock bus (use this for ramp reservations)',
    },
  })
