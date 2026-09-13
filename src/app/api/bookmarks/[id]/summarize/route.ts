import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  generateVideoSummary,
  isSummaryLanguage,
  DEFAULT_SUMMARY_LANGUAGE,
} from '@/lib/video-summary';

// LLM generation can take well past the platform's default limit
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    // Only decides the language of a new generation — a cached summary is
    // served whatever language it was written in, so switching the setting
    // takes effect on the next Regenerate.
    const langParam = searchParams.get('lang');
    const lang = isSummaryLanguage(langParam) ? langParam : DEFAULT_SUMMARY_LANGUAGE;

    const { data: bookmark, error: fetchError } = await supabase
      .from('bookmarks')
      .select('id, video_id, url, title, channel_name, description, video_summary')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !bookmark) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Return cached summary if available and not forced
    if (bookmark.video_summary && !force) {
      return NextResponse.json({ summary: bookmark.video_summary });
    }

    // Checked after the cache hit above: serving a stored summary is free, so
    // only an actual generation should count against the allowance.
    const limited = await enforceRateLimit(user, 'summarize');
    if (limited) return limited;

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'Missing API key configuration' }, { status: 500 });
    }

    const summary = await generateVideoSummary(bookmark, OPENROUTER_API_KEY, lang);

    const { error: updateError } = await supabase
      .from('bookmarks')
      .update({ video_summary: summary })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to save summary: ${updateError.message}`);
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
