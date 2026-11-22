# API

Base URL: `http://localhost:8787`

Auth: `Authorization: Bearer <jwt>` or `X-API-Key: qatk_…`

## Session

- `POST /api/auth/login` `{ email, password }`
- `GET /api/auth/me`

## Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET/PUT /api/projects/:projectId/quality-config`
- `GET/POST /api/projects/:projectId/api-keys`
- `POST /api/projects/:projectId/api-keys/:keyId/revoke`

## Import

- `POST /api/projects/:projectId/executions/import` multipart field `file` (ZIP or JSON), up to 3 GB (`MAX_UPLOAD_BYTES`)
  Optional fields: `branch`, `commit`, `environment`, `browser`, `pipeline`, `name`

CI helpers:

- `POST /api/executions` — open an execution
- `POST /api/executions/:id/artifacts`
- `POST /api/executions/:id/complete`
- `POST /api/ingest/github|gitlab|jenkins` — ZIP + metadata

## Query

- `GET /api/executions?projectId&q&environment&browser&branch&limit&offset`
- `GET /api/executions/:id`
- `DELETE /api/executions/:id`
- `POST /api/executions/:id/archive`
- `GET /api/executions/:id/results`
- `GET /api/executions/:id/failures`
- `GET /api/executions/:id/clusters`
- `GET /api/executions/:id/logs`
- `GET /api/executions/:id/videos`
- `GET /api/executions/:id/compare/:otherId` (current vs previous)
- `GET /api/executions/:id/reports/:kind?format=json|csv|html|pdf` kind: `qualification|execution|regression|failure` (`html`/`pdf` are the print-ready qualification document; add `download=1` to save the HTML)
- `POST /api/executions/:id/ai-analysis` (optional, skipped without `OPENAI_API_KEY`)
- `GET /api/testpoints?projectId`
- `GET /api/testpoints/:id`
- `GET /api/test-results/:id`
- `GET /api/dashboard?projectId`
- `GET /api/executive?projectId`
- `GET /api/performance?projectId`
- `GET /api/jira?projectId`
- `GET /api/search?projectId&q`
- `GET /api/artifacts/:id` — ranged streaming for videos
- `POST /api/failures/:id/reclassify` `{ category }`

Demo users after seed: `admin@qa.local` / `admin123`.
