## Purpose

Defines the observable contract for bot-classification-based traffic shaping across the public API: which traffic is challenged or blocked as likely automated, which routes are exempt regardless of score, and that no route ever requires a human-solvable interactive action to pass.

## ADDED Requirements

### Requirement: Automated traffic is rejected on ramp reservation write routes
The system SHALL apply bot-detection scoring to requests against the ramp reservation write routes (create and cancel), and SHALL reject or non-interactively challenge requests scored as automated, before they reach the backend.

#### Scenario: Scripted client is rejected
- **WHEN** a request against a ramp reservation write route scores as automated
- **THEN** the request is rejected or non-interactively challenged before reaching the backend

#### Scenario: Ordinary app usage passes through
- **WHEN** a request originates from the RampMe frontend running in a real browser
- **THEN** it is not rejected by bot scoring

### Requirement: No interactive challenge on any ramp route
The system SHALL NOT present a challenge that requires the caller to complete an interactive human action (for example, solving a puzzle or checking a box) on any ramp reservation route.

#### Scenario: API caller cannot solve a challenge
- **WHEN** a request against a ramp reservation route would otherwise receive an interactive challenge
- **THEN** it instead receives a non-interactive rejection, since the caller is a same-origin API request with no way to render or solve an interactive challenge

### Requirement: Read-only map traffic is exempt from write-route bot scoring
High-frequency, mechanically regular request patterns against read-only map endpoints (stops, vehicles, routes) SHALL NOT be subject to the stricter bot-scoring action applied to ramp reservation write routes.

#### Scenario: Rapid map panning is not blocked
- **WHEN** a legitimate user rapidly pans and zooms the map, producing many read-only requests in a short time
- **THEN** those requests are not rejected by the write-route bot mitigation rule
