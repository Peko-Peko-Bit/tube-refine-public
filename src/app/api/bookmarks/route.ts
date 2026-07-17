import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parseVideoMetadata, translateToEnglish } from '@/lib/youtube';

const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { url, user_tags = [] } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const match = url.match(ytRegex);
    const video_id = match ? match[1] : null;

    if (!video_id) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const isShort = url.includes('/shorts/');
    const finalUrl = isShort
      ? `https://www.youtube.com/shorts/${video_id}`
      : `https://www.youtube.com/watch?v=${video_id}`;

    // 1. oEmbed API — title & thumbnail (free, no key needed)
    let title: string | null = null;
    let thumbnail: string | null = null;
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${video_id}&format=json`
      );
      if (oembedRes.ok) {
        const d = await oembedRes.json();
        title = d.title || null;
        thumbnail = d.thumbnail_url || null;
      }
    } catch (e) {
      console.error('oEmbed fetch failed:', e);
    }

    // 2. YouTube Data API v3 — published_at, duration, description, tags, category, channel_name
    let published_at: string | null = null;
    let duration_seconds: number | null = null;
    let description: string | null = null;
    let tags: string[] = [];
    let category: string | null = null;
    let channel_name: string | null = null;

    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (YOUTUBE_API_KEY) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${video_id}&key=${YOUTUBE_API_KEY}`
        );
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          const item = ytData.items?.[0];
          if (item) {
            const meta = parseVideoMetadata(item);
            published_at = meta.published_at;
            description = meta.description;
            tags = meta.tags;
            category = meta.category;
            channel_name = meta.channel_name;
            duration_seconds = meta.duration_seconds;
            // oEmbed returns 401 for embed-disabled videos — fall back to the Data API
            title = title || meta.title;
            thumbnail = thumbnail || meta.thumbnail;
            console.log(`[YouTube API] ok — channel=${channel_name}, tags=${tags.length}, duration=${duration_seconds}s`);
          } else {
            console.warn(`[YouTube API] items empty for video_id=${video_id}`);
          }
        } else {
          const errText = await ytRes.text();
          console.error(`[YouTube API] HTTP ${ytRes.status}: ${errText}`);
        }
      } catch (e) {
        console.error('[YouTube API] Fetch error:', e);
      }
    } else {
      console.warn('[YouTube API] YOUTUBE_API_KEY not set — skipping');
    }

    // 3. Google Translate API — translate tags to English (stored in tags_en, hidden from UI)
    const tags_en = await translateToEnglish(tags);

    // 4. Insert to DB — ai_status:'pending' (Edge Function will generate summary)
    const { data: inserted, error: insertError } = await supabase
      .from('bookmarks')
      .insert({
        user_id: user.id,
        video_id,
        url: finalUrl,
        title,
        thumbnail,
        tags,
        tags_en,
        category,
        channel_name,
        published_at,
        duration_seconds,
        description,
        user_tags: user_tags.length > 0 ? user_tags : null,
        ai_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('bookmarks')
          .select()
          .eq('user_id', user.id)
          .eq('video_id', video_id)
          .single();
        return NextResponse.json({ data: existing }, { status: 200 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 5. Background: invoke Edge Function to generate description summary
    after(async () => {
      try {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await admin.functions.invoke('ai-tagging', {
          body: {
            record: inserted,
            description: description || '',
          }
        });
      } catch (e) {
        console.error('Background AI summary trigger failed:', e);
      }
    });

    return NextResponse.json({ data: inserted }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
