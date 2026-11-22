# QA TestPoint Analytics — Architecture

## Purpose

QA TestPoint Analytics turns Playwright TestPoint artifacts (JSON + logs + videos + screenshots) into a command center for one question:

> What failed, why, when it started failing, how often it fails, what changed, and can I prove it from video/logs?

The product is **TestPoint-native**. It does not treat Playwright specs as the primary unit of work. The hierarchy is:

```
Organization → Project → Execution → TestCase → TestPoint → Steps/Events → Logs + Video + Screenshots + Errors
```

## Packages

| Path | Role |
| --- | --- |
| `/shared` | Canonical types, JSON/log adapters, artifact matching, clustering, quality score, comparison |
| `/backend` | Fastify REST API, Prisma/SQLite (PostgreSQL-compatible model), file storage, auth, import, ingest |
| `/frontend` | React command center |
| `/tests` | Parser and analytics unit tests |
| `/docs` | This documentation |
| `/samples` | Optional example runs (the seed reads ../test_entretien/reports by default) |

## Import pipeline

```
ZIP or folder
   → detect files
   → adapter registry (Playwright JSON, TestCase-native JSON, generic)
   → log parser
   → artifact matcher
   → validation report
   → persist Execution / TestResults / Failures / Logs / Artifacts
   → cluster failures
   → quality score
   → dashboard
```

Adapters live in `shared/src/parsers`. New JSON versions are added as adapters; they must not require UI changes.

## Storage

- Relational data: Prisma (SQLite locally, same schema intended for PostgreSQL)
- Videos, traces, screenshots, raw JSON: filesystem under `/storage/artifacts/{projectId}/{executionId}`
- Uploaded files are never executed. Logs and JSON are treated as untrusted text.

## Auth

- JWT for interactive users
- SHA-256 hashed API keys (`qatk_…`) for CI ingest
- Roles: `admin`, `qa`, `viewer`
- Project isolation via `projectId` on every execution entity

## Phase map

1. **Core (implemented):** project, upload/ZIP, parsers, dashboard, TestPoint explorer, video, logs
2. **Analytics (implemented):** history, regressions, clustering, performance, comparison
3. **Automation (scaffolded):** upload API, API keys, GitHub/GitLab/Jenkins ingest
4. **Intelligence (optional stub):** AI summary separated from deterministic results
5. **Reporting (implemented):** qualification HTML (print-to-PDF) + JSON/CSV TestCase reports + executive dashboard
