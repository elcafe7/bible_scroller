# Security reports

One folder per release run of `.github/workflows/release.yml`, newest first.
Each folder has a `summary.md` (every check, its result, date and time in UTC)
and one file per check: OSV-Scanner report, SBOM, SHA256SUMS, attestation link,
VirusTotal links (when enabled) and the OpenSSF Scorecard JSON.

Only runs that published are committed here. A blocked run publishes nothing;
its report stays a workflow artifact and the "Release blocked" issue has the findings.

| Date (UTC) | Release | Result | Report |
|---|---|---|---|
| 2026-11-26 00:19:10 UTC | `v0.2.2` | pass | [summary](reports/v0.2.2_20261126T001910Z/summary.md) |
| 2026-11-25 20:50:41 UTC | `v0.2.1` | pass | [summary](reports/v0.2.1_20261125T205041Z/summary.md) |

Setup the maintainer does by hand (OpenSSF Best Practices, Socket.dev):
[MANUAL-STEPS.md](MANUAL-STEPS.md).
