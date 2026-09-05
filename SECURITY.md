# Security Policy

**English** · [Български](.github/SECURITY.bg.md)

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open [a new advisory](https://github.com/rangelovkiril/rampme-software/security/advisories/new) on this repository (also reachable from the **Security** tab, **Report a vulnerability**). This is the only reporting channel; there is no separate security email to keep in sync with it.

Do not open a public issue for a suspected vulnerability.

## Scope

Covered by this policy:

- `backend/` (the Bun/Elysia API) and `frontend/` (the Next.js app), both in this repository.
- `hw-sim/`, the in-process hardware simulator used for testing and the `backend-stage` deployment. It is a test double, not production hardware.

Out of scope for this repository:

- The ramp firmware itself, which lives in [`rampme-hardware`](https://github.com/rangelovkiril/rampme-hardware) — report there.
- The `fleet` GitOps/infrastructure repository — report there for cluster, Cloudflare, or deployment-level issues.

## Severity

RampMe holds no user accounts, no payment data, and no personal data beyond a client-generated session id used only to group a rider's own reservations. A generic severity scale (CVSS and similar) is built around confidentiality/integrity/availability of data and money at stake, neither of which applies here. Reports are triaged instead against what this system actually protects, highest impact first:

1. **Physical/mechanical actuation** — anything that lets an unauthorized party trigger, block, or otherwise interfere with a ramp's physical deployment.
2. **Availability** — anything that degrades or takes down the live map, the realtime feeds, or the ramp reservation flow for legitimate riders.
3. **Everything else** — for example, disclosure of data that is already public (Sofia's GTFS feeds carry no confidentiality requirement to begin with).

A report against `api-stage.rampme.site` cannot exceed the availability tier: staging runs against `hw-sim`, which has no physical actuator and accepts unauthenticated MQTT connections by design.

## Threat model

See the [Threat Model](https://github.com/rangelovkiril/rampme-software/wiki/Threat-Model) wiki page for the full reasoning behind this system's design (why there is no login, what is and isn't currently contained, and the trust boundaries involved).
