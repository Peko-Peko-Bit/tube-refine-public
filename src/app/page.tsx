import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import { Bookmark } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Mark bookmarks stuck in 'pending' (e.g. Edge Function invocation was lost)
  // as failed so the UI offers Retry instead of spinning forever.
  const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
  await supabase
    .from('bookmarks')
    .update({ ai_status: 'failed' })
    .eq('user_id', user.id)
    .eq('ai_status', 'pending')
    .lt('created_at', new Date(Date.now() - PENDING_TIMEOUT_MS).toISOString());

  // Fetch bookmarks without pagination for now
  const { data: bookmarks, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_trashed', false)
    .order('created_at', { ascending: false });

  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <DashboardClient 
      bookmarks={(bookmarks as Bookmark[]) || []} 
      avatarUrl={avatarUrl} 
    />
  );
}
