import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Minimal .env.local reader for the maintenance scripts. The app itself never
 * uses this — Next injects the same file locally and Vercel supplies the values
 * in production.
 */
export function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(join(repoRoot, '.env.local'), 'utf8');
  } catch {
    throw new Error('.env.local not found — these scripts need the local keys.');
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Throws with a readable message instead of letting `undefined` reach an API. */
export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
  return names.map((n) => process.env[n]);
}
