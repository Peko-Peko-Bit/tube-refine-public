/**
 * Freezes the guest demo fixture from the owner's live bookmarks.
 *
 * Reads the curated list in scripts/demo-bookmarks.json, pulls those rows from
 * the database, checks them over, and writes data/demo/bookmarks.json — the file
 * src/lib/guest-seed.ts inserts for every guest.
 *
 * Deliberately dropped on the way out:
 *   - `description` — the uploader's full description text. It is never rendered
 *     (cards show `description_summary`), and the fixture ships in a public repo.
 *   - `id` / `user_id` / `created_at` — issued per guest at seed time.
 *
 * Fail-closed: any problem aborts before the file is touched.
 *
 * Run: node scripts/export-demo-bookmarks.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, requireEnv, repoRoot } from './_env.mjs';

const OUTPUT = join(repoRoot, 'data/demo/bookmarks.json');

loadEnvLocal();
const [supabaseUrl, serviceKey] = requireEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
);

const list = JSON.parse(readFileSync(join(repoRoot, 'scripts/demo-bookmarks.json'), 'utf8'));
const items = list.items;
const problems = [];

const seen = new Set();
for (const item of items) {
  if (seen.has(item.videoId)) problems.push(`duplicate videoId: ${item.videoId}`);
  seen.add(item.videoId);
}

// Only the visible list has to be ordered; the trashed row never appears in it.
const visible = items.filter((i) => i.isTrashed !== true);
for (let i = 1; i < visible.length; i++) {
  if (visible[i].addedHoursAgo <= visible[i - 1].addedHoursAgo) {
    problems.push(
      `addedHoursAgo must increase down the list: ${visible[i - 1].videoId} (${visible[i - 1].addedHoursAgo}) -> ${visible[i].videoId} (${visible[i].addedHoursAgo})`
    );
  }
}

const supabase = createClient(supabaseUrl, serviceKey);
const { data: rows, error } = await supabase
  .from('bookmarks')
  .select(
    'video_id, url, title, thumbnail, tags, tags_en, tags_ai, tags_ai_en, category, ' +
      'channel_name, published_at, duration_seconds, description_summary, video_summary, ai_status'
  )
  .in(
    'video_id',
    items.map((i) => i.videoId)
  );

if (error) throw new Error(`Failed to read bookmarks: ${error.message}`);

const byVideoId = new Map(rows.map((r) => [r.video_id, r]));

const fixture = items.map((item) => {
  const row = byVideoId.get(item.videoId);
  const where = `${item.videoId} (${item.title})`;

  if (!row) {
    problems.push(`${where}: not in the database`);
    return null;
  }

  // Catches a mistyped id pointing at some other bookmark.
  if (!row.title?.includes(item.title)) {
    problems.push(`${where}: title no longer matches — database has "${row.title}"`);
  }
  if (row.ai_status !== 'done') problems.push(`${where}: ai_status is ${row.ai_status}`);
  if (!row.thumbnail) problems.push(`${where}: no thumbnail`);
  if (!row.description_summary) problems.push(`${where}: no description_summary`);

  // Shorts cards render neither the summary button nor tags, so they need no
  // video summary; everything else must already be cached or a visitor's click
  // would spend the guest budget.
  const isShort = row.url.includes('/shorts/');
  if (!isShort && !row.video_summary) {
    problems.push(`${where}: no video_summary — run scripts/generate-demo-summaries.mts`);
  }

  return {
    video_id: row.video_id,
    url: row.url,
    title: row.title,
    thumbnail: row.thumbnail,
    tags: row.tags,
    tags_en: row.tags_en,
    tags_ai: row.tags_ai,
    tags_ai_en: row.tags_ai_en,
    category: row.category,
    channel_name: row.channel_name,
    published_at: row.published_at,
    duration_seconds: row.duration_seconds,
    description_summary: row.description_summary,
    video_summary: isShort ? null : row.video_summary,
    is_trashed: item.isTrashed === true,
    rating: item.rating ?? null,
    user_tags: item.userTags ?? null,
    addedHoursAgo: item.addedHoursAgo,
  };
});

if (problems.length > 0) {
  console.error(`Refusing to write ${OUTPUT}:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

  const shorts = fixture.filter((f) => f.url.includes('/shorts/')).length;
  const trashed = fixture.filter((f) => f.is_trashed).length;
  console.log(`Wrote ${OUTPUT}`);
  console.log(
    `  ${fixture.length} rows — ${fixture.length - shorts - trashed} videos, ${shorts} shorts, ${trashed} trashed`
  );
  console.log(`  ${fixture.filter((f) => f.video_summary).length} with a cached video summary`);
  console.log(`  ${fixture.filter((f) => f.rating).length} rated, ${fixture.filter((f) => f.user_tags).length} with user tags`);
}
