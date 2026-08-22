## Purpose

Defines the behavior contract for the backend's Server-Sent Events streams (GTFS realtime vehicle/trip/stop data and the ramp session stream): connection lifecycle, how each stream learns about a change in its own domain, and how clients learn whether the data they are seeing is still fresh.

## Requirements

### Requirement: Connection lifecycle
An SSE stream SHALL send the current data to a client immediately on connect, SHALL keep the connection alive with periodic heartbeats during periods without a relevant change, and SHALL stop sending and release any per-connection resources when the client disconnects.

#### Scenario: Initial data on connect
- **WHEN** a client connects to an SSE stream
- **THEN** it receives the current data as the first message, without waiting for the next change

#### Scenario: Heartbeat during quiet periods
- **WHEN** no relevant change occurs for longer than the heartbeat interval
- **THEN** the stream sends a heartbeat so intermediary proxies do not treat the connection as idle and close it

#### Scenario: Cleanup on disconnect
- **WHEN** the client disconnects
- **THEN** the server stops sending to that connection and releases resources held for it

### Requirement: Domain-scoped change notification
Each SSE stream SHALL be notified only by changes relevant to its own domain. A domain's own change SHALL trigger a push to that domain's streams without depending on, or simulating, another domain's signal.

#### Scenario: GTFS-RT data changes
- **WHEN** GTFS-RT feed data changes
- **THEN** clients on GTFS-RT-derived streams (vehicle positions, trip ETAs, stop arrivals) receive updated data

#### Scenario: Ramp reservation state changes
- **WHEN** a ramp reservation changes state (for example, hardware confirms deployment)
- **THEN** clients on the ramp session stream receive updated data without waiting for the next GTFS-RT refresh

### Requirement: Per-feed staleness detection
The system SHALL track, per upstream GTFS-RT feed, the time since the last successful fetch, and SHALL consider a feed degraded once that duration exceeds a configurable threshold.

#### Scenario: Feed exceeds staleness threshold
- **WHEN** an upstream feed has not been fetched successfully for longer than the configured staleness threshold
- **THEN** that feed is considered degraded

#### Scenario: Feed recovers
- **WHEN** a degraded feed is fetched successfully again
- **THEN** it is no longer considered degraded

#### Scenario: Threshold is configurable
- **WHEN** the staleness threshold is changed via configuration
- **THEN** the system uses the new threshold without a code change

### Requirement: Explicit data-freshness signal
A stream whose data depends on one or more GTFS-RT feeds SHALL emit a distinct freshness signal, separate from ordinary data updates, when the degraded state of a feed it depends on changes. It SHALL NOT emit a freshness signal when the degraded state is unchanged since the previous check.

#### Scenario: Feed degrades
- **WHEN** a feed a stream depends on transitions from healthy to degraded
- **THEN** the stream emits a freshness signal indicating degradation

#### Scenario: Feed recovers
- **WHEN** a feed a stream depends on transitions from degraded back to healthy
- **THEN** the stream emits a freshness signal indicating recovery

#### Scenario: No change, no signal
- **WHEN** a feed's degraded state has not changed since the previous check
- **THEN** no freshness signal is emitted for it

#### Scenario: Multiple feed dependencies
- **WHEN** a stream's data depends on more than one feed
- **THEN** the stream is considered degraded if any one of the feeds it depends on is degraded

### Requirement: Freshness parity between streaming and non-streaming access
An endpoint that exposes the same underlying data as an SSE stream, whether accessed by streaming or by a direct request, SHALL report the same freshness state for that data.

#### Scenario: Direct request during degraded feed
- **WHEN** a client requests data via the non-streaming endpoint while the underlying feed is degraded
- **THEN** the response includes the same degraded/staleness indication surfaced on the streaming equivalent
