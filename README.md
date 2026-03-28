# RampMe

## Presentation Link

https://www.canva.com/design/DAHFDWV7DkA/-L-Wb9y9991tjE6tHmhyzA/edit

**Making public transport accessible for everyone.**

RampMe is a real-time transit accessibility platform that helps people with mobility impairments board buses, trams, and trolleybuses in Sofia. The software works together with an embedded hardware ramp system — users can request a wheelchair ramp deployment at their stop directly from the app.

## How It Works

1. **Browse the live map** — see all public transport vehicles moving in real time across Sofia
2. **Tap a stop** — view upcoming arrivals with live ETAs and delay info
3. **Tap a vehicle** — see its full trip timeline with all upcoming stops
4. **Request a ramp** — when near a stop, press the Ramp button to signal the driver to deploy the wheelchair ramp

The ramp request is designed to integrate with an embedded hardware module installed on vehicles that receives the signal and activates the physical ramp mechanism.

## Features

- Real-time vehicle tracking with GTFS-Realtime data from Sofia Traffic
- Live arrival predictions with delay detection
- Interactive map with vehicle route polylines
- Stop arrivals panel with ramp-equipped vehicle filtering
- Vehicle trip timeline showing departed/upcoming stops
- Wheelchair ramp request system (proximity-based)
- Dark/light theme support
- Mobile-responsive bottom sheet UI with drag gestures
- GPS-based user location tracking

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Leaflet + react-leaflet, Tailwind CSS 4 |
| **Backend** | Bun, Elysia, Protobuf.js, JSZip, SQLite |
| **Data** | GTFS Static (Sofia Traffic), GTFS-Realtime (vehicle positions + trip updates) |
| **Infrastructure** | Docker, GitHub Actions CI |
| **Communication** | MQTT (for embedded ramp hardware integration) |

## Project Structure

```
rampme-software/
├── backend/
│   ├── src/
│   │   ├── index.ts          # API server (Elysia)
│   │   ├── config.ts         # Environment configuration
│   │   ├── gtfs/
│   │   │   ├── static.ts     # GTFS ZIP parsing & indexing
│   │   │   ├── realtime.ts   # GTFS-RT protobuf feeds
│   │   │   ├── types.ts      # Data type definitions
│   │   │   └── cache.ts      # Data caching layer
│   │   └── db/
│   │       └── vehicles.ts   # SQLite vehicle metadata (low-floor info)
│   └── proto/
│       └── gtfs-realtime.proto
├── frontend/
│   ├── app/                  # Next.js app router
│   ├── components/
│   │   ├── Map.tsx           # Main map orchestrator
│   │   ├── VehiclesLayer.tsx  # Real-time vehicle markers
│   │   ├── StopsLayer.tsx     # Transit stop markers
│   │   ├── RouteLinesLayer.tsx # Route polylines
│   │   ├── LiveLocation.tsx   # GPS user location
│   │   ├── MapControls.tsx    # Zoom, theme, location buttons
│   │   ├── StopArrivalsSheet.tsx    # Stop detail bottom sheet
│   │   └── VehicleTripSheet.tsx     # Vehicle trip timeline sheet
│   └── public/
└── .github/workflows/ci.yaml
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd rampme-software

# Install dependencies
cd backend && bun install
cd ../frontend && bun install
```

### Run

```bash
# Terminal 1 — Backend (port 3000)
cd backend
bun run dev

# Terminal 2 — Frontend (port 3001)
cd frontend
bun run dev
```

The frontend proxies API requests to the backend automatically via Next.js rewrites.

### Environment Variables

Copy `.env.local.example` and adjust if needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3000` | Backend API URL for frontend proxy |
| `GTFS_STATIC_URL` | Sofia Traffic API | GTFS static data ZIP endpoint |
| `GTFS_RT_BASE_URL` | Sofia Traffic API | GTFS-Realtime feed base URL |
| `PORT` | `3000` | Backend server port |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stops` | All transit stops |
| GET | `/stops/:id/vehicles` | Upcoming vehicles at a stop |
| GET | `/routes/shapes` | Route polyline geometries |
| GET | `/realtime/vehicles` | All active vehicle positions |
| GET | `/realtime/vehicles/:id/trip` | Trip timeline for a specific vehicle |

## Team

Built at Hackathon 2026 with the mission of making public transport truly accessible.