## Purpose

Lets the ramp reservation-to-deploy lifecycle, including hardware failure and timeout paths, be exercised end to end without a physical ramp module or a second managed MQTT broker.

## ADDED Requirements

### Requirement: Simulator tracks reservation commands per vehicle
The simulator SHALL accept `new_reservation` and `cancel_reservation` commands for a vehicle and track which reservation IDs are outstanding for that vehicle, matching the ramp MQTT protocol's `cmd` topic contract.

#### Scenario: New reservation is tracked
- **WHEN** a `new_reservation` command for a reservation ID arrives for a vehicle
- **THEN** the simulator considers that reservation outstanding for that vehicle

#### Scenario: Cancelled reservation is dropped
- **WHEN** a `cancel_reservation` command arrives for a reservation ID previously tracked as outstanding
- **THEN** the simulator no longer considers that reservation outstanding

### Requirement: Simulator publishes a deploy state sequence
On a `deploy` command, the simulator SHALL publish hardware state transitions on the vehicle's `state` topic in the order a working ramp module would: `deploying`, then `deployed`, then `done`.

#### Scenario: Happy-path deploy
- **WHEN** a `deploy` command arrives for a vehicle whose active profile is the default (happy-path) profile
- **THEN** the simulator publishes `deploying`, then `deployed`, then `done` for that vehicle, in that order

### Requirement: Simulator supports configurable failure and timeout profiles
The simulator SHALL support per-vehicle behavior profiles that deviate from the happy path, so failure handling can be exercised deliberately.

#### Scenario: No-acknowledgement profile times out the caller
- **WHEN** a `deploy` command arrives for a vehicle whose active profile is "no-ack"
- **THEN** the simulator publishes no state transition for that deploy cycle, leaving the caller's own deploy-acknowledgement timeout to elapse

#### Scenario: Error profile reports a hardware error
- **WHEN** a `deploy` command arrives for a vehicle whose active profile is "error"
- **THEN** the simulator publishes an `error` state for that vehicle instead of `deploying`/`deployed`/`done`

### Requirement: A vehicle's profile can be changed without restarting the simulator
The simulator SHALL expose a control interface that changes a single vehicle's active behavior profile at runtime, without affecting other vehicles and without requiring the simulator process to restart.

#### Scenario: Profile change is scoped to one vehicle
- **WHEN** vehicle A's profile is changed to "error" while vehicle B keeps the default profile
- **THEN** a subsequent `deploy` command for vehicle A produces an `error` state, and a `deploy` command for vehicle B still produces the happy-path sequence

### Requirement: Simulator requires no broker credentials
The simulator's MQTT interface SHALL accept connections without a username or password, so a non-production backend deployment can point at it without provisioning or storing hardware broker credentials.

#### Scenario: Backend connects without credentials
- **WHEN** a backend instance connects to the simulator's MQTT interface with no username or password configured
- **THEN** the connection succeeds and the backend can subscribe to and publish on ramp topics
