import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseVideoMetadata, translateToEnglish } from '@/lib/youtube';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: bookmark, error: fetchError } = await supabase
      .from('bookmarks')
      .select('id, video_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !bookmark) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cheap per call, but it still spends YouTube quota and Translation characters
    const limited = await enforceRateLimit(user, 'refetch');
    if (limited) return limited;

    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });
    }

    // Re-fetch YouTube metadata
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${bookmark.video_id}&key=${YOUTUBE_API_KEY}`
    );

    if (!ytRes.ok) {
      const errText = await ytRes.text();
      return NextResponse.json({ error: `YouTube API error: ${ytRes.status} ${errText}` }, { status: 502 });
    }

    const ytData = await ytRes.json();
    const item = ytData.items?.[0];

    if (!item) {
      return NextResponse.json({ error: 'Video not found in YouTube API' }, { status: 404 });
    }

    const meta = parseVideoMetadata(item);
    const tags_en = await translateToEnglish(meta.tags);

    // Update only YouTube-sourced fields; never touch user_tags, tags_ai, description_summary, video_summary
    const update: Record<string, unknown> = {
      tags: meta.tags,
      tags_en,
      published_at: meta.published_at,
      duration_seconds: meta.duration_seconds,
      description: meta.description,
      category: meta.category,
      channel_name: meta.channel_name,
    };

    // Backfill title/thumbnail (missing when oEmbed rejected an embed-disabled
    // video at save time); only set when the API actually returned values
    if (meta.title) update.title = meta.title;
    if (meta.thumbnail) update.thumbnail = meta.thumbnail;

    const { data: updated, error: updateError } = await supabase
      .from('bookmarks')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
