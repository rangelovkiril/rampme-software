## Purpose

Defines the observable contract for bot-classification-based traffic shaping across the public API: what triggers a challenge, that it applies zone-wide (this plan tier has no per-route scoping), and what operational safety net exists for the accepted risk that this can affect the ramp reservation write routes.

## Requirements

### Requirement: Zone-wide bot scoring is enabled
The system SHALL apply Cloudflare's bot-detection scoring to all traffic in the zone, including ramp reservation write routes and read-only map routes alike, since this plan tier's bot mitigation product runs outside the Ruleset Engine and cannot be scoped to a subset of routes.

#### Scenario: Scripted client is challenged
- **WHEN** a request anywhere in the zone scores as automated
- **THEN** Cloudflare issues a challenge before the request reaches the backend

#### Scenario: Ordinary app usage passes through
- **WHEN** a request originates from the RampMe frontend running in a real browser
- **THEN** it is not challenged by bot scoring, consistent with the product's design intent of targeting non-browser automation rather than same-origin calls from an already-rendered page

### Requirement: No route-level exemption exists at this plan tier
The system SHALL NOT rely on a per-route skip or exemption for bot scoring, since none is available on the Free plan; this is a documented, accepted gap, not a configuration to be added later without a plan change.

#### Scenario: Attempting to exempt a route
- **WHEN** a custom rule or skip rule targets bot management for a specific path
- **THEN** it has no effect, because this bot mitigation product runs outside the Ruleset Engine those mechanisms operate on

### Requirement: Live verification gates enabling this in production
Enabling zone-wide bot scoring SHALL be immediately followed by verifying the ramp reservation create and cancel flow against the live deployed frontend, before the rollout is considered complete, since this zone has no isolated staging surface (production and stage share one Cloudflare zone).

#### Scenario: Verification fails
- **WHEN** the live reservation flow is challenged or broken after enabling bot scoring
- **THEN** bot scoring is disabled (a single toggle) rather than left enabled while a scoped fix is designed
