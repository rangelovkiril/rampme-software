## Purpose

Lets the single statically-exported frontend build resolve which backend deployment to call from where it is actually running, instead of a single URL baked in at build time, so a preview or unrecognized deployment cannot silently reach production.

## ADDED Requirements

### Requirement: Explicit build-time API URL takes precedence
When an API base URL is explicitly configured at build time, the frontend SHALL use it regardless of the runtime hostname.

#### Scenario: Explicit build-time URL wins
- **WHEN** the frontend is built with an explicit API base URL configured
- **THEN** every API call uses that URL, independent of the hostname the page is served from

### Requirement: Recognized production hostname resolves to the production API
When no build-time API URL is configured, the frontend SHALL resolve API calls to the production backend when served from the production hostname.

#### Scenario: Production site calls production API
- **WHEN** the frontend is served from the production hostname and no build-time API URL is configured
- **THEN** API calls resolve to the production backend

### Requirement: Recognized staging hostname resolves to the stage API
When no build-time API URL is configured, the frontend SHALL resolve API calls to the stage backend when served from the staging hostname.

#### Scenario: Staging site calls stage API
- **WHEN** the frontend is served from the staging hostname and no build-time API URL is configured
- **THEN** API calls resolve to the stage backend

### Requirement: Unrecognized hostname falls back to the stage API
When no build-time API URL is configured and the runtime hostname matches neither the production nor the staging hostname, the frontend SHALL resolve API calls to the stage backend rather than production.

#### Scenario: Unrecognized preview hostname does not reach production
- **WHEN** the frontend is served from a hostname that is neither the production nor the staging hostname, and no build-time API URL is configured
- **THEN** API calls resolve to the stage backend, not the production backend
