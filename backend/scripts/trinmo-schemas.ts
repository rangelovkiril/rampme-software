import { type Static, Type as t } from '@sinclair/typebox'

// trinmo.org exposes these as an internal API for its own frontend, not a
// documented public contract — validate at the boundary like any other
// untrusted external input, so an upstream shape change fails loudly here
// instead of silently corrupting the accessibility dataset.
export const TRINMO_BASE_URL = 'https://trinmo.org'

export const FleetListItemSchema = t.Object({
  status: t.Number(),
  url: t.String(),
  vehicleType: t.String(),
})

export const FleetListResponseSchema = t.Object({
  results: t.Array(FleetListItemSchema),
})

export type FleetListResponse = Static<typeof FleetListResponseSchema>

// Raw sightings are full of nulls (unrelated photo tags, incomplete
// captions) — nullable rather than required, filtered out by the caller.
const ModelDetailVehicleSchema = t.Object({
  inventory: t.Optional(t.Union([t.String(), t.Null()])),
  vehicleType: t.Optional(t.Union([t.String(), t.Null()])),
  status: t.Optional(t.Union([t.Object({ name: t.String() }), t.Null()])),
  model: t.Optional(t.Union([t.Object({ name: t.String() }), t.Null()])),
})

const ModelDetailImageSchema = t.Object({
  vehicles: t.Optional(t.Array(ModelDetailVehicleSchema)),
})

export const ModelDetailResponseSchema = t.Object({
  images: t.Optional(t.Array(ModelDetailImageSchema)),
})

export type ModelDetailResponse = Static<typeof ModelDetailResponseSchema>
