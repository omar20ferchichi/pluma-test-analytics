# Data model

Core entities (Prisma: `backend/prisma/schema.prisma`):

- **Organization** — tenant
- **Project** — one Playwright/TestPoint codebase
- **User / Membership** — RBAC (`admin`, `qa`, `viewer`)
- **ApiKey** — CI upload credentials, hashed at rest
- **Execution** — one suite run, sequential ID per project (`#142`, `#143`, …)
- **TestCase** — catalog keyed by `(projectId, externalId)`
- **TestPoint** — catalog keyed by `(projectId, externalId)` such as `TP-OPEN-AUDIT_TRACK_BANK`
- **TestResult** — TestPoint outcome inside an execution (status, duration, retries, error, fingerprint)
- **Failure** — failed TestResult plus category (auto + optional manual override)
- **FailureClusterRow** — grouped fingerprints for an execution
- **LogLine** — parsed logger lines associated to TestPoint/TestCase when possible
- **Artifact** — video/screenshot/trace/log/json stored on disk, not in SQLite BLOBs
- **JiraTicket** — optional ticket key (test_entretien uses `*****`, treated as none); Jira API is not required
- **QualityConfig** — per-project weights for the quality score
- **AuditLog** — import, delete, API key, reclassify

Indexes exist on execution history, failure fingerprint/category, and log level.

## Relationships

```
Project 1—* Execution 1—* TestResult *—1 TestPoint
                         1—* Failure
                         1—* LogLine
                         1—* Artifact
TestPoint *—1 TestCase (optional)
TestPoint.ticketId → JiraTicket.key (logical, not mandatory FK)
```
