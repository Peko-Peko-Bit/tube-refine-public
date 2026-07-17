import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
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
    const body = await req.json();

    // Only allow updating user-editable fields
    const update: Record<string, unknown> = {};

    if ('rating' in body) {
      const rating = body.rating;
      const valid = rating === null ||
        (Number.isInteger(rating) && rating >= 0 && rating <= 100);
      if (!valid) {
        return NextResponse.json({ error: 'rating must be null or an integer between 0 and 100' }, { status: 400 });
      }
      update.rating = rating;
    }

    if ('user_tags' in body) {
      const tags = body.user_tags;
      const valid = tags === null ||
        (Array.isArray(tags) && tags.length <= 20 &&
          tags.every((t: unknown) => typeof t === 'string' && t.trim().length >= 1 && t.trim().length <= 50));
      if (!valid) {
        return NextResponse.json({ error: 'user_tags must be null or an array of up to 20 strings (1-50 chars each)' }, { status: 400 });
      }
      update.user_tags = tags === null ? null : tags.map((t: string) => t.trim());
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bookmarks')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
