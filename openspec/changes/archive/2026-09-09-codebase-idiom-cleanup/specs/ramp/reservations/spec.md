## ADDED Requirements

### Requirement: Reservation expiry succeeds without a hardware bridge
Reservations SHALL be expired on their normal terms even when no hardware bridge is available (`MQTT_URL` unset, or the bridge has not yet finished connecting), on the same terms as reservation creation and cancellation. A reservation that has outlived its expiry window, or whose vehicle has been absent from the realtime feed beyond the absence threshold, SHALL reach `expired` status regardless of bridge availability. Publishing a deploy command to hardware is a best-effort side effect of proximity detection, not a precondition for the lifecycle advancing.

#### Scenario: Reservation past its expiry window expires with no MQTT configured
- **WHEN** a reservation is older than its expiry window while no hardware bridge is available
- **THEN** its status is recorded as `expired`, and it is no longer returned as pending or active by `GET /ramp/session` or `GET /ramp/vehicle/:id`

#### Scenario: Reservation for a long-absent vehicle expires with no MQTT configured
- **WHEN** a reservation's vehicle has been absent from the realtime vehicle feed beyond the absence threshold while no hardware bridge is available
- **THEN** its status is recorded as `expired`

### Requirement: One reservation's outcome does not suppress another's
Reservation lifecycle processing SHALL evaluate every outstanding reservation on each pass. A reservation that cannot be advanced, for any reason including an unavailable hardware bridge, SHALL NOT prevent other outstanding reservations from being evaluated in that same pass.

#### Scenario: A blocked reservation does not stall the rest
- **WHEN** one outstanding reservation cannot be advanced and another outstanding reservation is due to expire, in the same processing pass
- **THEN** the due reservation is still recorded as `expired`

### Requirement: Proximity-triggered deployment is unchanged when a bridge is connected
When a hardware bridge is available, proximity-triggered deployment SHALL continue to publish the deploy command to hardware and to apply the deploy-acknowledgement timeout, exactly as before this change. This is the proximity counterpart to the existing requirement covering reservation creation and cancellation, and does not replace it.

#### Scenario: Proximity still triggers a deploy when a bridge is connected
- **WHEN** a vehicle with a pending reservation reaches the reserved stop while a hardware bridge is connected
- **THEN** a `deploy` command is published on that vehicle's `cmd` topic, and the deploy-acknowledgement timeout applies as before
