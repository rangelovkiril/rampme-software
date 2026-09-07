## Purpose

Determines, for a live GTFS-RT vehicle, whether it is physically equipped with a wheelchair ramp, and surfaces that fact distinctly from whether a reservation is currently active on it, so riders and the map can tell has-ramp, no-ramp, and unknown vehicles apart.

## ADDED Requirements

### Requirement: Accessibility reference dataset freshness
The system SHALL maintain a reference dataset resolving a vehicle's identity to its wheelchair-ramp equipment, refreshed on a periodic schedule independent of both the GTFS-RT fetch cadence and any individual client request. Resolving a live vehicle's accessibility SHALL NOT require a network call at request time.

#### Scenario: Scheduled refresh
- **WHEN** the reference dataset's refresh schedule elapses
- **THEN** the system fetches and rebuilds the dataset out-of-band, independent of the live vehicle-position request path

#### Scenario: Refresh failure does not degrade the live feed
- **WHEN** a scheduled refresh fails or is unavailable
- **THEN** the system continues serving vehicle accessibility from the last successfully built dataset, and the vehicle-position feed remains available

### Requirement: Three distinguishable accessibility states
For any live vehicle, the system SHALL expose one of three distinguishable states: ramp-equipped, not ramp-equipped, or unknown. Unknown SHALL be reported only when the vehicle's identity cannot be resolved against the reference dataset, never as a stand-in for "not ramp-equipped". Whether a reservation is currently pending or active on a vehicle is a separate fact, layered only on top of a ramp-equipped vehicle.

#### Scenario: Vehicle resolves to a ramp-equipped model
- **WHEN** a live vehicle's identity resolves to a model known to have a wheelchair ramp
- **THEN** the vehicle is reported as ramp-equipped

#### Scenario: Vehicle resolves to a model without a ramp
- **WHEN** a live vehicle's identity resolves to a model known not to have a wheelchair ramp
- **THEN** the vehicle is reported as not ramp-equipped, distinctly from unknown

#### Scenario: Vehicle identity cannot be resolved
- **WHEN** a live vehicle's identity has no match in the reference dataset (never observed, or too new to be catalogued)
- **THEN** the vehicle is reported as unknown, and the system does not guess

### Requirement: No confident false positive from identity reuse
Vehicle identity numbers are reused over time, including across different vehicle types (bus, tram, trolleybus). The system SHALL NOT report a vehicle as ramp-equipped or not-ramp-equipped based on a reference-dataset entry belonging to a different vehicle type than the one the live vehicle is currently operating as, or to a vehicle no longer in service.

#### Scenario: Same identity number, different historical vehicle type
- **WHEN** a live vehicle's numeric identity matches a reference-dataset entry recorded for a different vehicle type (for example, a bus route vehicle matching a historical tram entry)
- **THEN** the system disregards that entry and reports the vehicle as unknown rather than asserting the mismatched entry's accessibility

#### Scenario: Same identity number, retired vehicle
- **WHEN** a live vehicle's numeric identity matches only reference-dataset entries no longer marked as in service
- **THEN** the system reports the vehicle as unknown rather than asserting a retired entry's accessibility

### Requirement: Map shows accessibility at a glance
The map SHALL visually distinguish ramp-equipped, not-ramp-equipped, and unknown vehicles from each other without requiring the rider to open a detail view.

#### Scenario: Ramp-equipped vehicle on the map
- **WHEN** a vehicle reported as ramp-equipped is rendered on the map
- **THEN** its marker is visually distinguishable from not-ramp-equipped and unknown vehicles

#### Scenario: Not-ramp-equipped vehicle on the map
- **WHEN** a vehicle reported as not ramp-equipped is rendered on the map
- **THEN** its marker is visually distinguishable from ramp-equipped and unknown vehicles

#### Scenario: Unknown vehicle on the map
- **WHEN** a vehicle reported as unknown is rendered on the map
- **THEN** its marker is visually distinguishable from both ramp-equipped and not-ramp-equipped vehicles, and does not imply either
