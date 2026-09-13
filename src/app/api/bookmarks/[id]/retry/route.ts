import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rate-limit';

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
    
    // In next.js 15 app router, params are often async, let's await them
    const { id } = await params;

    const { data: bookmark, error: fetchError } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !bookmark) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (bookmark.ai_status !== 'failed') {
      return NextResponse.json({ error: 'Only failed bookmarks can be retried' }, { status: 400 });
    }

    // Checked after the 'failed' guard so a no-op retry never costs quota
    const limited = await enforceRateLimit(user, 'retry');
    if (limited) return limited;

    // Only reset AI-generated fields; preserve YouTube-sourced data (tags, category, channel_name etc.)
    const { data: updated, error: updateError } = await supabase
      .from('bookmarks')
      .update({
        ai_status: 'pending',
        description_summary: null,
        tags_ai: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Call Edge Function for retry, passing full bookmark data for context.
    // Use the service role client: the function only accepts server calls
    // (ownership was verified by the user_id-scoped fetch above).
    try {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await admin.functions.invoke('ai-tagging', {
        body: {
          record: bookmark,
          description: bookmark.description || '',
        }
      });
    } catch (e) {
      console.error('Failed to invoke edge function for retry:', e);
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
