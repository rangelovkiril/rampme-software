## ADDED Requirements

### Requirement: Vehicle detail header shows ramp equipment
The vehicle detail header SHALL visibly state whether the selected vehicle is ramp-equipped, not ramp-equipped, or unresolved, using the same equipment wording as the map. The state SHALL be readable as text without relying on colour or hover, on both mobile and desktop. An active reservation SHALL NOT be presented as evidence that a ramp is ready for immediate use.

#### Scenario: Equipped vehicle
- **WHEN** the rider opens a vehicle reported as ramp-equipped, including one with an active reservation
- **THEN** the header displays `С рампа`

#### Scenario: Vehicle without a ramp
- **WHEN** the rider opens a vehicle reported as not ramp-equipped
- **THEN** the header displays `Без рампа`

#### Scenario: Unresolved or unavailable equipment data
- **WHEN** the selected vehicle's equipment is unresolved or no equipment data has been received
- **THEN** the header displays `Достъпност неизвестна`, without implying either equipped or not equipped

### Requirement: Header status follows the selected vehicle
The header SHALL show equipment information for the selected vehicle when opened from either the map or a reservation. Newly received equipment information SHALL update the open header without reopening it. Switching vehicles SHALL NOT retain the previous vehicle's equipment status.

#### Scenario: Opening a vehicle from a reservation
- **WHEN** a reservation opens the vehicle detail using its identifier and equipment information subsequently becomes available
- **THEN** the header updates from unknown to the reported equipment state for that identifier

#### Scenario: Changing the selected vehicle
- **WHEN** the rider selects another vehicle
- **THEN** the header shows the newly selected vehicle's equipment state, or unknown if unavailable

#### Scenario: Equipment information changes
- **WHEN** an update changes the reported equipment state of the selected vehicle
- **THEN** the open header reflects that update
