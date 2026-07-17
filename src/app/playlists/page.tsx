import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import ProfileMenu from "@/components/ProfileMenu";
import { ListMusic } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <main className="min-h-screen w-full max-w-5xl mx-auto p-4 pb-24 md:p-8 md:pb-24 flex flex-col relative">
      <header className="flex items-center justify-between py-6 mb-8 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <ListMusic className="w-6 h-6 text-neutral-900 dark:text-white" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Playlists</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <ProfileMenu avatarUrl={avatarUrl} />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-700">
          <ListMusic className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Playlists Coming Soon</h2>
        <p className="text-neutral-500 max-w-sm">
          Here you will be able to organize your saved videos into custom playlists.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
