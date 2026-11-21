# Aviation Data Source Approval Register

> **Policy**: Public API or website availability is **not** authorization from airlines, airports, or data providers to ingest, transform, store, or redistribute data. Live connectors remain **disabled** and `FixtureFlightDataProvider` (`fixture` mode) remains the default until product-specific rights evidence is recorded below.

| Source ID | Candidate | Source Scope | Commercial / Product Permission | Retention & Storage Rules | Attribution & Redistribution | Quotas / Rate Limits | Approval Status | Approval Evidence |
|---|---|---|---|---|---|---|---|---|
| `fixture` | `FixtureFlightDataProvider` | Deterministic local fixtures for SBBR, SBGR, SBSP, SBRJ and sample inferred events | Approved for local development, CI, and automated testing | No live ingestion; no raw aircraft history | Internal deterministic test fixtures | Unlimited (zero network requests) | **APPROVED (Default)** | `specs/002-personalized-flight-alerts/plan.md` |
| `flightradar24` | Flightradar24 Business API | Live/historical commercial flight tracking | Paid business subscription required; competing products and unauthorized raw redistribution restricted | Prohibit unauthorized long-term raw storage; do not combine with another near-time/real-time provider | Attribution and display rules require written terms confirmation | Subscription/credit metered | **UNAPPROVED** | Pending written product-specific license agreement |
| `adsb_lol` | ADSB.lol Public API | Public ADS-B aircraft state vectors | Open Data Commons Open Database License (ODbL 1.0) | Review derived-database / share-alike obligations before persistence | ODbL 1.0 attribution and share-alike obligations apply; does not grant airline authorization | 500 requests/day per IP anonymous quota | **UNAPPROVED** | Pending legal review of ODbL 1.0 obligations |
| `opensky` | OpenSky Network REST API | ADS-B state vectors (research/non-commercial default) | Non-commercial/research only on public tier; commercial product use requires written agreement | Subject to commercial license terms | Citation/attribution required; not commercial airline delay feed | Metered anonymous/registered credit limits | **UNAPPROVED** | Pending written commercial agreement with OpenSky |
| `aeroescuta` | AeroEscuta (`aeroescuta.com.br`) | Brazilian aviation-band audio streams | Not affiliated with airlines/entities; explicitly lacks structured flight-event API | Do not ingest, record, or redistribute audio streams | Prohibited without explicit written permission | N/A | **PROHIBITED / UNAPPROVED** | `apps/api/src/activity/providers/source-policy.ts` enforces unconditional rejection |

## Enforcement

`assertApprovedDataSource` in `apps/api/src/activity/providers/source-policy.ts` blocks enabling any live source without recorded approval evidence and unconditionally blocks `aeroescuta`.
