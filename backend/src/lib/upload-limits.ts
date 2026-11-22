const DEFAULT_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
const DEFAULT_JSON_BYTES = 512 * 1024 * 1024;
const DEFAULT_LOG_BYTES = 128 * 1024 * 1024;

function envBytes(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function maxUploadBytes(): number {
  return envBytes("MAX_UPLOAD_BYTES", DEFAULT_UPLOAD_BYTES);
}

export function maxJsonBytes(): number {
  return envBytes("MAX_JSON_BYTES", DEFAULT_JSON_BYTES);
}

export function maxLogBytes(): number {
  return envBytes("MAX_LOG_BYTES", DEFAULT_LOG_BYTES);
}

export function uploadLimitLabel(bytes = maxUploadBytes()): string {
  const gb = bytes / (1024 * 1024 * 1024);
  const rounded = Math.round(gb * 10) / 10;
  return `${rounded} GB`;
}

export function tooLargeMessage(what = "Upload"): string {
  return `${what} exceeds the ${uploadLimitLabel()} limit. Pack a single execution iteration, or raise MAX_UPLOAD_BYTES.`;
}
