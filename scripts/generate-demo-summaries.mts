/**
 * Pre-generates the video summaries for the guest demo fixture.
 *
 * The demo ships with every regular video already summarised, so a visitor's
 * "View Summary" is instant and costs nothing — the guest summarize budget is
 * then spent only on videos they add themselves.
 *
 * This writes `video_summary` on the owner's own rows, exactly as pressing the
 * button in the app would; it reuses the same prompt and model via
 * `src/lib/video-summary.ts`. Shorts are skipped: their card has no summary
 * button.
 *
 * Run once:  node scripts/generate-demo-summaries.mts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, requireEnv, repoRoot } from './_env.mjs';
import { generateVideoSummary, SUMMARY_MODEL } from '../src/lib/video-summary.ts';

const dryRun = process.argv.includes('--dry-run');

loadEnvLocal();
const [supabaseUrl, serviceKey, openRouterKey] = requireEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY'
);

const supabase = createClient(supabaseUrl, serviceKey);

const list = JSON.parse(readFileSync(join(repoRoot, 'scripts/demo-bookmarks.json'), 'utf8'));
const videoIds = list.items.map((i) => i.videoId);

const { data: rows, error } = await supabase
  .from('bookmarks')
  .select('id, video_id, url, title, channel_name, description, video_summary')
  .in('video_id', videoIds);

if (error) throw new Error(`Failed to read bookmarks: ${error.message}`);

const byId = new Map(rows.map((r) => [r.video_id, r]));
const missing = videoIds.filter((v) => !byId.has(v));
if (missing.length > 0) {
  throw new Error(`Not in the database: ${missing.join(', ')}`);
}

// Shorts never show a summary button, so generating one would be wasted spend.
const pending = videoIds
  .map((v) => byId.get(v))
  .filter((r) => !r.video_summary && !r.url.includes('/shorts/'));

console.log(`${videoIds.length} in the list, ${pending.length} need a summary (model: ${SUMMARY_MODEL})`);
for (const r of pending) console.log(`  - ${r.video_id}  ${r.title}`);

// Left as a plain conditional rather than process.exit(): exiting while the
// Supabase client still holds sockets trips a libuv assertion on Windows.
if (pending.length === 0) {
  console.log('Nothing to do.');
} else if (dryRun) {
  console.log('\n--dry-run: no API calls made, nothing written.');
} else {
  let done = 0;
  const failed = [];

  for (const row of pending) {
    process.stdout.write(`\n[${done + 1}/${pending.length}] ${row.title?.slice(0, 50)} ... `);
    try {
      const summary = await generateVideoSummary(row, openRouterKey);
      const { error: updateError } = await supabase
        .from('bookmarks')
        .update({ video_summary: summary })
        .eq('id', row.id);
      if (updateError) throw new Error(updateError.message);
      console.log(`ok (${summary.length} chars)`);
      done++;
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      failed.push(row.video_id);
    }
  }

  console.log(`\nGenerated ${done}/${pending.length}.`);
  if (failed.length > 0) {
    console.log(`Failed (re-run to retry): ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}
