import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Create session succeeded
      return NextResponse.redirect(`${origin}${next}`);
    }
    
    console.error('Auth check error:', error);
  }

  // Fallback if no code or error
  return NextResponse.redirect(`${origin}/?error=auth`);
}
