## Purpose

Defines how ramp reservation creation and cancellation behave with respect to hardware-bridge (MQTT) availability, so a rider's reservation is never lost or rejected due to a transient or absent connection to the hardware side of the system.

## ADDED Requirements

### Requirement: Reservation creation succeeds without a hardware bridge
`POST /ramp/reserve` SHALL create and durably record the reservation and return a successful response even when no hardware bridge is available (`MQTT_URL` unset, or the bridge has not yet finished connecting). Notifying hardware over MQTT is a best-effort side effect of an already-successful reservation, not a precondition for the HTTP response.

#### Scenario: Reserve succeeds with no MQTT configured
- **WHEN** `POST /ramp/reserve` is called while no hardware bridge is available
- **THEN** the response is successful, and the reservation is recorded and retrievable via `GET /ramp/session` and `GET /ramp/vehicle/:id`

### Requirement: Reservation cancellation succeeds without a hardware bridge
`DELETE /ramp/reserve/:id` SHALL cancel and durably record the cancellation and return a successful response even when no hardware bridge is available, on the same terms as reservation creation.

#### Scenario: Cancel succeeds with no MQTT configured
- **WHEN** `DELETE /ramp/reserve/:id` is called for an owned, cancellable reservation while no hardware bridge is available
- **THEN** the response is successful, and the reservation's status is recorded as cancelled

### Requirement: Hardware-bridge behavior is unchanged when connected
When a hardware bridge is available, `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` SHALL continue to publish the corresponding MQTT command to hardware, exactly as before this change.

#### Scenario: Reserve still notifies hardware when a bridge is connected
- **WHEN** `POST /ramp/reserve` is called while a hardware bridge is connected
- **THEN** the reservation is recorded and a `new_reservation` command is published on the vehicle's `cmd` topic, as before
