import { Elysia, t } from 'elysia'
import { setProfile } from './simulator'

export const controlApp = new Elysia()
  .get('/health', () => 'Ok')
  .post(
    '/vehicles/:vehicleId/profile',
    ({ params, body }) => {
      setProfile(params.vehicleId, body.profile)
      return { vehicleId: params.vehicleId, profile: body.profile }
    },
    {
      body: t.Object({
        profile: t.Union([t.Literal('happy'), t.Literal('no-ack'), t.Literal('error')]),
      }),
    },
  )
