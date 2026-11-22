import { describe, expect, it } from "vitest";
import { parsePlaywrightTraceEvents, remapArtifactPath, sampleTraceFrames } from "@qa/shared";

const TRACE = `
{"type":"before","callId":"c1","startTime":10,"class":"Locator","method":"click"}
{"type":"screencast-frame","sha1":"aaa","width":800,"height":600,"timestamp":11}
{"type":"screencast-frame","sha1":"bbb","width":800,"height":600,"timestamp":20}
{"type":"after","callId":"c1","endTime":21,"error":{"message":"Timeout waiting for payment status"}}
`.trim();

describe("Playwright trace parser", () => {
  it("reads screencast frames and failed actions from JSONL", () => {
    const parsed = parsePlaywrightTraceEvents(TRACE);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.frames[0]?.sha1).toBe("aaa");
    expect(parsed.actions[0]?.title).toBe("Locator.click");
    expect(parsed.actions[0]?.error).toBe("Timeout waiting for payment status");
  });

  it("samples long filmstrips", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => ({ sha1: String(i), timestamp: i, width: 1, height: 1 }));
    expect(sampleTraceFrames(frames, 50).length).toBeLessThanOrEqual(51);
  });

  it("remaps absolute Playwright attachment paths onto package files", () => {
    const rel = remapArtifactPath(
      "/home/Omar.Ferchichi/Desktop/ultimate_test/test-results/filters-bank-deposit-id-filter-chromium/trace.zip",
      ["results.json", "test-results/filters-bank-deposit-id-filter-chromium/trace.zip"],
    );
    expect(rel).toBe("test-results/filters-bank-deposit-id-filter-chromium/trace.zip");
  });

  it("picks the matching parent folder when many files are named trace.zip", () => {
    const rel = remapArtifactPath(
      "/tmp/pw/test-results/scenarios-ACC-03-Accounting-ACC-03-Rule-priority-conflict-chromium/trace.zip",
      [
        "test-results/scenarios-ACC-01-Accountin-2c19c-nal-entry-from-a-sale-event-chromium/trace.zip",
        "test-results/scenarios-ACC-03-Accounting-ACC-03-Rule-priority-conflict-chromium/trace.zip",
      ],
    );
    expect(rel).toBe("test-results/scenarios-ACC-03-Accounting-ACC-03-Rule-priority-conflict-chromium/trace.zip");
  });
});
