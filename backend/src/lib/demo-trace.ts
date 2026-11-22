import AdmZip from "adm-zip";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function createMinimalTraceZip(options?: { error?: string }): Buffer {
  const zip = new AdmZip();
  const sha1 = "a".repeat(40);
  zip.addFile(`resources/${sha1}`, PNG);
  zip.addFile(
    "0.trace",
    Buffer.from(
      [
        JSON.stringify({ type: "before", callId: "call1", startTime: 1000, class: "Page", method: "goto", title: "Open page" }),
        JSON.stringify({ type: "screencast-frame", pageId: "page1", sha1, width: 1280, height: 720, timestamp: 1100 }),
        JSON.stringify({ type: "screencast-frame", pageId: "page1", sha1, width: 1280, height: 720, timestamp: 1300 }),
        JSON.stringify({
          type: "after",
          callId: "call1",
          endTime: 1400,
          error: options?.error ? { message: options.error } : undefined,
        }),
      ].join("\n"),
    ),
  );
  return zip.toBuffer();
}
