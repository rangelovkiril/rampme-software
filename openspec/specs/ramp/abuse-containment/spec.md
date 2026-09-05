## Purpose

Defines the observable contract for edge-level abuse containment on the ramp reservation write routes: what volume of reservation traffic is allowed through per source, what is rejected before reaching the backend, and which routes are exempt regardless of volume.

## Requirements

### Requirement: Rate limiting on ramp reservation write routes
The system SHALL reject reservation-creation and reservation-cancellation requests from a single source IP address once they exceed a configured rate, before those requests reach the backend.

#### Scenario: Normal usage passes through
- **WHEN** a rider creates or cancels reservations at a rate consistent with normal single-person use
- **THEN** all requests are processed normally

#### Scenario: Volumetric abuse from one IP is rejected
- **WHEN** a single source IP sends reservation-creation or reservation-cancellation requests in excess of the configured rate
- **THEN** requests beyond the threshold receive an immediate rejection and never reach the backend

#### Scenario: Rotating a self-declared session id does not bypass the limit
- **WHEN** a client sends requests from the same source IP using a different self-declared session id on each request
- **THEN** the rate limit still applies, since it is keyed by source IP, not by the client-declared session id

### Requirement: Streaming endpoints are exempt from the reservation rate limit
Server-Sent Events endpoints under the ramp and realtime domains SHALL NOT be subject to the reservation write-route rate limit, regardless of connection or reconnection frequency.

#### Scenario: Reconnect storm does not trigger rejection
- **WHEN** a client's SSE connection drops and reconnects repeatedly (for example, due to a network interruption)
- **THEN** the reconnecting stream is not rejected by the reservation rate limit

### Requirement: Predictable, non-interactive rejection
A request rejected by the reservation rate limit SHALL receive a non-interactive rejection response that calling code can detect and handle, not a response that requires an interactive human action to complete.

#### Scenario: Threshold exceeded
- **WHEN** a request exceeds the configured rate
- **THEN** the response is a rejection status detectable by the calling code, with no interactive challenge involved
