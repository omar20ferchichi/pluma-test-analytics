# GitHub Actions

```yaml
name: Playwright TestPoints
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npx playwright test
      - name: Pack execution
        if: always()
        run: |
          mkdir -p execution
          # Prefer the timestamped run folder (reports/latest)
          cp -r reports/latest/. execution/ || true
          zip -r execution.zip execution
      - name: Upload to QA TestPoint Analytics
        if: always()
        run: |
          curl -X POST "$QA_ANALYTICS_URL/api/ingest/github" \
            -H "X-API-Key: $QA_ANALYTICS_API_KEY" \
            -F "file=@execution.zip" \
            -F "projectId=$QA_PROJECT_ID" \
            -F "branch=${GITHUB_REF_NAME}" \
            -F "sha=${GITHUB_SHA}" \
            -F "pipeline=${GITHUB_RUN_ID}" \
            -F "environment=QA" \
            -F "browser=chromium"
```

GitLab: `POST /api/ingest/gitlab` with `CI_COMMIT_BRANCH`, `CI_COMMIT_SHA`, `CI_PIPELINE_ID`.
Jenkins: `POST /api/ingest/jenkins` with `GIT_BRANCH`, `GIT_COMMIT`, `BUILD_ID`.
