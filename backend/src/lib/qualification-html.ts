import { formatPctPoints, type QualificationDefect, type QualificationReport } from "@qa/shared";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function paragraphs(items: string[]): string {
  return items.filter(Boolean).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function bullets(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function analysisBox(title: string, items: string[] | undefined): string {
  if (!items?.length) return "";
  return `<aside class="analysis"><h4>${escapeHtml(title)}</h4>${paragraphs(items)}</aside>`;
}

function pairTable(rows: Array<{ item: string; details: string | number }>, headers: [string, string] = ["Item", "Details"]): string {
  return `<div class="table-wrap"><table class="kpi pair">
    <colgroup><col class="col-label"/><col class="col-value"/></colgroup>
    <thead><tr><th>${escapeHtml(headers[0])}</th><th>${escapeHtml(headers[1])}</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr><td class="label">${escapeHtml(row.item)}</td><td>${escapeHtml(row.details)}</td></tr>`)
      .join("")}</tbody>
  </table></div>`;
}

function dataTable(headers: Array<{ label: string; num?: boolean; width?: string }>, rows: string[][]): string {
  const colgroup = `<colgroup>${headers.map((col) => `<col${col.width ? ` style="width:${col.width}"` : ""}/>`).join("")}</colgroup>`;
  const head = headers.map((col) => `<th class="${col.num ? "num" : ""}">${escapeHtml(col.label)}</th>`).join("");
  const body = rows
    .map((cells) => {
      const tds = cells
        .map((cell, index) => `<td class="${headers[index]?.num ? "num" : ""}">${cell}</td>`)
        .join("");
      const isTotal = cells[0] === "Total";
      return `<tr${isTotal ? ` class="total"` : ""}>${tds}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="kpi grid">${colgroup}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function durationLabel(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function statusClass(status: string): string {
  if (status === "passed" || status === "flaky") return "ok";
  if (status === "failed" || status === "timedOut" || status === "interrupted") return "bad";
  return "";
}

function vsPreviousLabel(value?: QualificationDefect["vsPrevious"]): string {
  if (value === "new") return "New vs previous";
  if (value === "remaining") return "Still failing";
  return "This execution";
}

function defectCards(items: QualificationDefect[]): string {
  if (!items.length) {
    return `<p>No defects were identified during this execution.</p>`;
  }
  return items
    .map(
      (item) => `<article class="defect">
        <header><span class="sev ${item.severity.toLowerCase()}">${escapeHtml(item.severity)}</span> ${escapeHtml(item.testCase)}</header>
        <dl>
          <dt>TestCase ID</dt><dd class="mono">${escapeHtml(item.testCaseId)}</dd>
          <dt>Failed step</dt><dd>${escapeHtml(item.testPoint)}${item.description && item.description !== item.testCase ? ` — ${escapeHtml(item.description)}` : ""}</dd>
          <dt>Module</dt><dd>${escapeHtml(item.module)}</dd>
          <dt>Category</dt><dd>${escapeHtml(item.category)}</dd>
          <dt>Status vs previous</dt><dd>${escapeHtml(vsPreviousLabel(item.vsPrevious))}</dd>
          <dt>Observation</dt><dd class="mono">${escapeHtml(item.message || "No error message was captured.")}</dd>
          <dt>Impact</dt><dd>${escapeHtml(item.impact)}</dd>
          <dt>Analysis</dt><dd>${escapeHtml(item.analysis)}</dd>
          <dt>Recommended action</dt><dd>${escapeHtml(item.action)}</dd>
        </dl>
      </article>`,
    )
    .join("");
}

export function renderQualificationHtml(report: QualificationReport, options?: { autoPrint?: boolean; preview?: boolean }): string {
  const kpis = report.kpis;
  const prev = report.previousKpis;
  const org = report.organization;
  const orgTotal = org.reduce(
    (sum, row) => ({
      testCases: sum.testCases + row.testCases,
      passed: sum.passed + row.passed,
      failed: sum.failed + row.failed,
      skipped: sum.skipped + row.skipped,
    }),
    { testCases: 0, passed: 0, failed: 0, skipped: 0 },
  );
  const orgRows = [
    ...org.map((row) => [
      escapeHtml(row.module),
      String(row.testCases),
      String(row.passed),
      String(row.failed),
      String(row.skipped),
    ]),
    ["Total", String(orgTotal.testCases), String(orgTotal.passed), String(orgTotal.failed), String(orgTotal.skipped)],
  ];
  const severityRows = [
    ...report.defects.bySeverity.map((row) => [escapeHtml(row.severity), String(row.count)]),
    ["Total", String(report.defects.identified)],
  ];
  const moduleDefectRows = report.defects.byModule.length
    ? [
        ...report.defects.byModule.map((row) => [
          escapeHtml(row.module),
          String(row.Blocker),
          String(row.Major),
          String(row.Medium),
          String(row.Minor),
          String(row.total),
        ]),
        [
          "Total",
          String(report.defects.byModule.reduce((sum, row) => sum + row.Blocker, 0)),
          String(report.defects.byModule.reduce((sum, row) => sum + row.Major, 0)),
          String(report.defects.byModule.reduce((sum, row) => sum + row.Medium, 0)),
          String(report.defects.byModule.reduce((sum, row) => sum + row.Minor, 0)),
          String(report.defects.identified),
        ],
      ]
    : [["No defects identified.", "0", "0", "0", "0", "0"]];
  const comparison = report.comparison
    ? `<h3>Release comparison KPI</h3>
      ${dataTable(
        [
          { label: "KPI", width: "28%" },
          { label: report.comparison.previousLabel, num: true },
          { label: report.comparison.currentLabel, num: true },
          { label: "Movement", num: true, width: "18%" },
        ],
        report.comparison.rows.map((row) => [
          escapeHtml(row.kpi),
          escapeHtml(row.previous),
          escapeHtml(row.current),
          escapeHtml(row.improvement),
        ]),
      )}
      ${analysisBox("Comparison analysis", report.analysis.comparison)}`
    : `${analysisBox("Comparison analysis", report.analysis.comparison)}`;
  const caseRows = report.cases.map((row, index) => [
    String(index + 1),
    `<span class="mono">${escapeHtml(row.id)}</span>`,
    escapeHtml(row.name),
    escapeHtml(row.module),
    `<span class="${statusClass(row.status)}">${escapeHtml(row.status)}</span>`,
    escapeHtml(durationLabel(row.durationMs)),
  ]);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(report.title)} — ${escapeHtml(report.subtitle)}</title>
  <style>
    :root { --navy:#1b365d; --line:#c5d0de; --muted:#4b5563; --paper:#fff; }
    * { box-sizing: border-box; }
    html, body { max-width: 100%; }
    body { margin:0; background:#d9e2ec; color:#1f2937; font: 11pt/1.45 "Calibri","Segoe UI",Arial,sans-serif; overflow-x: hidden; }
    .toolbar { position:sticky; top:0; z-index:2; display:flex; gap:8px; justify-content:flex-end; padding:10px 16px; background:#1b365d; color:#fff; }
    .toolbar button { border:0; border-radius:6px; padding:8px 12px; font-weight:600; cursor:pointer; background:#fff; color:var(--navy); }
    .sheet { width:210mm; max-width:100%; margin:16px auto 32px; background:var(--paper); padding:14mm 12mm 16mm; box-shadow:0 10px 40px rgba(15,23,42,.18); overflow-x: hidden; }
    .banner { display:flex; justify-content:space-between; gap:16px; border-bottom:2.5px solid var(--navy); color:var(--navy); font-size:10pt; font-weight:700; letter-spacing:.02em; padding-bottom:6px; }
    h1 { font-size:24pt; color:var(--navy); margin:36px 0 6px; line-height:1.15; }
    .subtitle { font-size:13pt; color:var(--navy); margin:0 0 28px; }
    h2 { font-size:13.5pt; color:var(--navy); margin:24px 0 8px; border-bottom:1px solid #d7e0ea; padding-bottom:4px; }
    h3 { font-size:11.5pt; color:var(--navy); margin:16px 0 8px; }
    h4 { font-size:10.5pt; color:var(--navy); margin:0 0 6px; }
    p { margin:0 0 8px; }
    ul { margin:6px 0 12px 18px; padding:0; }
    li { margin:0 0 4px; }
    .table-wrap { width:100%; max-width:100%; overflow-x:auto; margin:8px 0 12px; }
    table.kpi { width:100%; max-width:100%; border-collapse:collapse; table-layout:fixed; }
    table.kpi th { background:var(--navy); color:#fff; text-align:left; font-weight:600; }
    table.kpi th, table.kpi td { border:1px solid var(--line); padding:7px 8px; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; }
    table.pair .col-label { width:38%; }
    table.pair td.label { font-weight:600; color:#1b365d; }
    table.kpi td.num, table.kpi th.num { text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
    table.kpi tr.total td { font-weight:700; background:#f3f6fb; }
    .cover-meta { width:min(420px, 100%); margin-top:36px; table-layout:fixed; }
    .cover-meta col.col-label { width:38%; }
    .analysis { margin:8px 0 16px; padding:10px 12px; border-left:4px solid var(--navy); background:#f4f7fb; }
    .analysis p:last-child { margin-bottom:0; }
    .defect { border:1px solid var(--line); margin:0 0 12px; page-break-inside:avoid; }
    .defect header { background:#f3f6fb; color:var(--navy); font-weight:700; padding:8px 10px; overflow-wrap:anywhere; }
    .defect dl { display:grid; grid-template-columns: 150px 1fr; gap:6px 12px; margin:0; padding:8px 10px 10px; }
    .defect dt { font-weight:700; color:var(--navy); }
    .defect dd { margin:0; overflow-wrap:anywhere; }
    .sev { display:inline-block; min-width:72px; text-align:center; border-radius:4px; padding:1px 6px; margin-right:6px; color:#fff; font-size:9.5pt; }
    .sev.blocker { background:#8a1c13; }
    .sev.major { background:#b42318; }
    .sev.medium { background:#b45309; }
    .sev.minor { background:#475569; }
    .signoff { margin-top:18px; padding:12px 14px; border-left:4px solid var(--navy); background:#f3f6fb; font-weight:700; color:var(--navy); }
    .ok { color:#0f7b4c; font-weight:700; text-transform:capitalize; }
    .bad { color:#b42318; font-weight:700; text-transform:capitalize; }
    .muted { color:var(--muted); font-size:10pt; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size:9.5pt; overflow-wrap:anywhere; word-break:break-all; }
    @page { size:A4; margin:14mm 12mm; }
    @media print {
      body { background:#fff; }
      .toolbar { display:none !important; }
      .sheet { width:auto; margin:0; padding:0; box-shadow:none; }
      h2, h3, .analysis, .defect { break-inside:avoid; }
      tr { break-inside:avoid; }
    }
    @media (max-width: 820px) {
      .sheet { padding: 12px; }
      .defect dl { grid-template-columns: 1fr; }
      .defect dt { margin-top: 6px; }
    }
  </style>
</head>
<body>
  ${options?.preview ? "" : `<div class="toolbar no-print">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>`}
  <article class="sheet">
    <header class="banner"><span>${escapeHtml(report.project)} Qualification Report</span><span>${escapeHtml(report.subtitle)}</span></header>
    <section class="cover">
      <h1>${escapeHtml(report.title)}</h1>
      <p class="subtitle">${escapeHtml(report.subtitle)}</p>
      <table class="kpi pair cover-meta">
        <colgroup><col class="col-label"/><col class="col-value"/></colgroup>
        <tbody>
          <tr><td class="label">Editor</td><td>${escapeHtml(report.editor.role)}</td></tr>
          <tr><td class="label">Name</td><td>${escapeHtml(report.editor.name)}</td></tr>
          <tr><td class="label">Date</td><td>${escapeHtml(report.editor.date)}</td></tr>
        </tbody>
      </table>
    </section>

    <h2>1. Objective</h2>
    ${paragraphs(report.objective)}

    <h2>2. Scope</h2>
    <h3>2.1 Current execution</h3>
    <p>The qualification campaign covered the business processes and functionalities across:</p>
    ${bullets(report.scope.modules.map((module) => module))}
    ${paragraphs(report.scope.inScope)}
    ${
      report.scope.previous
        ? `<h3>2.2 Previous execution baseline</h3>
           <p>${escapeHtml(report.scope.previous.label)} executed ${report.scope.previous.testCases} TestCases with a ${escapeHtml(formatPctPoints(report.scope.previous.passRate))} pass rate and is used as the comparison baseline.</p>`
        : ""
    }
    <h3>2.${report.scope.previous ? "3" : "2"} Out of Scope</h3>
    ${bullets(report.scope.outOfScope)}

    <h2>3. Test Strategy</h2>
    ${report.strategy.map((item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>`).join("")}

    <h2>4. Test Environment</h2>
    ${pairTable(report.environment)}

    <h2>5. Test Execution Summary</h2>
    <h3>5.1 ${escapeHtml(report.executionLabel)}</h3>
    ${pairTable(
      [
        { item: "Total Test Cases", details: kpis.totalTestCases },
        { item: "Executed", details: kpis.executed },
        { item: "Passed", details: kpis.passed },
        { item: "Failed", details: kpis.failed },
        { item: "Skipped", details: kpis.skipped },
        { item: "To Do", details: kpis.toDo },
        { item: "Pass Rate", details: formatPctPoints(kpis.passRate) },
        { item: "Execution Rate", details: formatPctPoints(kpis.executionRate) },
        { item: "Duration", details: durationLabel(kpis.durationMs) },
        { item: "Quality Score", details: Math.round(kpis.qualityScore) },
      ],
      ["KPI", "Result"],
    )}
    ${
      prev
        ? `<h3>5.2 Previous execution${report.previousLabel ? ` — ${escapeHtml(report.previousLabel)}` : ""}</h3>
           ${pairTable(
             [
               { item: "Total Test Cases", details: prev.totalTestCases },
               { item: "Executed", details: prev.executed },
               { item: "Passed", details: prev.passed },
               { item: "Failed", details: prev.failed },
               { item: "Pass Rate", details: formatPctPoints(prev.passRate) },
               { item: "Execution Rate", details: formatPctPoints(prev.executionRate) },
             ],
             ["KPI", "Result"],
           )}`
        : ""
    }
    ${analysisBox("Execution analysis", report.analysis.execution)}

    <h2>6. Test Execution Organization</h2>
    <p>The campaign was organized by functional module inferred from TestCase names. TestCases are listed in run order in the appendix.</p>
    ${dataTable(
      [
        { label: "Module", width: "36%" },
        { label: "Test Cases", num: true },
        { label: "Passed", num: true },
        { label: "Failed", num: true },
        { label: "Skipped", num: true },
      ],
      org.length ? orgRows : [["No TestCases in this execution.", "0", "0", "0", "0"]],
    )}
    ${analysisBox("Organization analysis", report.analysis.organization)}

    <h2>7. Defect Management &amp; KPI Analysis</h2>
    ${
      report.defects.identified === 0
        ? `<p>No defects were identified during this qualification campaign. All executed TestCases passed successfully, and no blocking, critical, major, medium, or minor defects were raised as a result of the testing.</p>`
        : `<p>A total of ${report.defects.identified} failed TestCase${report.defects.identified === 1 ? "" : "s"} ${report.defects.identified === 1 ? "was" : "were"} identified during this campaign. They remain open against this execution until retested. Each finding below includes impact, analysis, and a recommended action — not only a count.</p>`
    }
    ${analysisBox("Defect analysis", report.analysis.defects)}
    <h3>7.1 Defect distribution by severity</h3>
    ${dataTable(
      [
        { label: "Severity", width: "55%" },
        { label: "Count", num: true },
      ],
      severityRows,
    )}
    <h3>7.2 Defect distribution by module</h3>
    ${dataTable(
      [
        { label: "Module", width: "28%" },
        { label: "Blocker", num: true },
        { label: "Major", num: true },
        { label: "Medium", num: true },
        { label: "Minor", num: true },
        { label: "Total", num: true },
      ],
      moduleDefectRows,
    )}
    <h3>7.3 Quality KPIs</h3>
    ${pairTable(report.defects.qualityKpis.map((row) => ({ item: row.kpi, details: row.value })), ["KPI", "Value"])}
    <h3>7.4 Defect details</h3>
    ${defectCards(report.defects.items)}

    <h2>8. Campaign Highlights</h2>
    ${paragraphs(report.highlights)}
    ${comparison}

    <h2>9. Risks &amp; Mitigation</h2>
    ${dataTable(
      [
        { label: "Risk", width: "36%" },
        { label: "Mitigation" },
      ],
      report.risks.map((row) => [escapeHtml(row.risk), escapeHtml(row.mitigation)]),
    )}

    <h2>10. QA Conclusion</h2>
    ${paragraphs(report.conclusion)}
    <div class="signoff">${escapeHtml(report.signOff)}</div>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} by QA TestPoint Analytics.</p>

    <h2>11. Appendix — TestCase results (run order)</h2>
    ${dataTable(
      [
        { label: "#", num: true, width: "6%" },
        { label: "ID", width: "24%" },
        { label: "TestCase", width: "32%" },
        { label: "Module", width: "20%" },
        { label: "Status", width: "10%" },
        { label: "Duration", num: true, width: "8%" },
      ],
      caseRows.length ? caseRows : [["—", "None", "—", "—", "—", "—"]],
    )}
  </article>
  ${options?.autoPrint ? `<script>window.addEventListener("load", () => setTimeout(() => window.print(), 200));</script>` : ""}
</body>
</html>`;
}
