import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { parsePlaywrightTraceEvents, sampleTraceFrames } from "@qa/shared";
import { prisma } from "../lib/prisma.js";
import { id } from "../lib/ids.js";
import { ensureDir, safeJoin } from "../lib/storage.js";

function sniffType(buf: Buffer): { ext: string; contentType: string } {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: ".jpg", contentType: "image/jpeg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: ".png", contentType: "image/png" };
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF") {
    return { ext: ".webm", contentType: "video/webm" };
  }
  return { ext: ".bin", contentType: "application/octet-stream" };
}

function zipEntry(zip: AdmZip, name: string) {
  const wanted = name.replace(/\\/g, "/");
  return zip.getEntries().find((entry) => {
    const n = entry.entryName.replace(/\\/g, "/");
    return n === wanted || n.endsWith(`/${wanted}`) || n === `resources/${wanted}` || n.endsWith(`/${name}`);
  });
}

export async function extractPlaywrightTraces(executionId: string) {
  const traces = await prisma.artifact.findMany({
    where: {
      executionId,
      OR: [{ kind: "trace" }, { name: { contains: "trace.zip" } }],
    },
  });

  for (const trace of traces) {
    if (!existsSync(trace.storagePath)) continue;
    let zip: AdmZip;
    try {
      zip = new AdmZip(trace.storagePath);
    } catch {
      continue;
    }
    const resultId = trace.resultId ?? undefined;
    const outDir = path.join(path.dirname(trace.storagePath), `_extracted_${trace.id.slice(-10)}_${path.basename(trace.storagePath, ".zip")}`);
    await ensureDir(outDir);

    const videos = zip.getEntries().filter((entry) => /\.(webm|mp4)$/i.test(entry.entryName) && !entry.isDirectory);
    for (const video of videos) {
      const rel = video.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
      if (rel.includes("..")) continue;
      const target = safeJoin(outDir, rel.split("/").pop() ?? rel);
      await mkdir(path.dirname(target), { recursive: true });
      const data = video.getData();
      await writeFile(target, data);
      await prisma.artifact.create({
        data: {
          id: id("art"),
          executionId,
          resultId,
          kind: "video",
          name: path.basename(rel),
          storagePath: target,
          contentType: rel.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm",
          size: data.length,
          testPointExternalId: trace.testPointExternalId,
        },
      });
    }

    const traceFiles = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && /\.trace$/i.test(entry.entryName) && !entry.entryName.includes(".."));
    let frames: ReturnType<typeof parsePlaywrightTraceEvents>["frames"] = [];
    let actions: ReturnType<typeof parsePlaywrightTraceEvents>["actions"] = [];
    for (const file of traceFiles) {
      const parsed = parsePlaywrightTraceEvents(file.getData().toString("utf8"));
      frames = frames.concat(parsed.frames);
      actions = actions.concat(parsed.actions);
    }
    frames = sampleTraceFrames(frames, 300);

    const storedFrames: Array<{ artifactId: string; timestamp: number; width: number; height: number; sha1: string }> = [];
    for (const frame of frames) {
      const entry =
        zipEntry(zip, `resources/${frame.sha1}`) ??
        zipEntry(zip, frame.sha1);
      if (!entry) continue;
      const data = entry.getData();
      const sniff = sniffType(data);
      const filename = `frame-${String(storedFrames.length).padStart(4, "0")}-${frame.sha1.slice(0, 10)}${sniff.ext}`;
      const target = path.join(outDir, filename);
      await writeFile(target, data);
      const row = await prisma.artifact.create({
        data: {
          id: id("art"),
          executionId,
          resultId,
          kind: "trace-frame",
          name: filename,
          storagePath: target,
          contentType: sniff.contentType,
          size: data.length,
          testPointExternalId: trace.testPointExternalId,
        },
      });
      storedFrames.push({
        artifactId: row.id,
        timestamp: frame.timestamp,
        width: frame.width,
        height: frame.height,
        sha1: frame.sha1,
      });
    }

    const index = {
      zipArtifactId: trace.id,
      videoExtracted: videos.length > 0,
      frameCount: storedFrames.length,
      frames: storedFrames,
      actions,
    };
    const indexPath = path.join(outDir, "index.json");
    await writeFile(indexPath, JSON.stringify(index));
    await prisma.artifact.create({
      data: {
        id: id("art"),
        executionId,
        resultId,
        kind: "trace-index",
        name: "trace-index.json",
        storagePath: indexPath,
        contentType: "application/json",
        size: Buffer.byteLength(JSON.stringify(index)),
        testPointExternalId: trace.testPointExternalId,
      },
    });

    if (!trace.resultId && resultId) {
      await prisma.artifact.update({
        where: { id: trace.id },
        data: { resultId },
      });
    }
  }
}
