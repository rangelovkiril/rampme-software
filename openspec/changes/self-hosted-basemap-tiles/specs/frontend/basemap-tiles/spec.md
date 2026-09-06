## Purpose

Lets the frontend render its interactive light/dark basemap from infrastructure the project already controls, instead of a third-party tile API that can gate, rate-limit, or discontinue its free tier at any time.

## ADDED Requirements

### Requirement: Basemap renders without a third-party tile API at runtime
The frontend SHALL render the interactive basemap from a self-hosted vector tile source, without depending on a third-party tile API at runtime.

#### Scenario: Map loads with no third-party tile requests
- **WHEN** the frontend loads the map
- **THEN** basemap tiles are fetched from the project's own Cloudflare R2-hosted PMTiles source, not a third-party tile provider

### Requirement: Light and dark basemap styles are both supported
The frontend SHALL support both a light and a dark basemap style, generated from the same self-hosted vector tile source.

#### Scenario: Theme toggle switches the basemap style
- **WHEN** the user toggles the map theme between light and dark
- **THEN** the basemap re-renders using the corresponding style generated from the self-hosted vector tile source

### Requirement: OpenStreetMap attribution is visible
The frontend SHALL display visible OpenStreetMap attribution on the map, regardless of tile provider.

#### Scenario: Attribution control is visible on the map
- **WHEN** the map is rendered
- **THEN** an OpenStreetMap attribution control is visible on screen, not suppressed by CSS
