import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChevronLeft, Trash2, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen w-full max-w-2xl mx-auto p-4 md:p-8 flex flex-col">
      <header className="flex items-center gap-4 py-6 mb-8 border-b border-neutral-200 dark:border-neutral-800">
        <Link 
          href="/" 
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-neutral-900 dark:text-white" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Settings</h1>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        {/* General Settings Section */}
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4 px-2">Data Management</h2>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            
            {/* Trash Bin Button */}
            <Link href="/trash" className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900 dark:text-white">Trash Bin</h3>
                  <p className="text-sm text-neutral-500">View and restore deleted bookmarks</p>
                </div>
              </div>
            </Link>
            
          </div>
        </section>

        {/* Account Section */}
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4 px-2">Account</h2>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden shrink-0">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400 text-lg font-medium">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="font-medium text-neutral-900 dark:text-white truncate">
                  {user.user_metadata?.full_name || "User"}
                </p>
                <p className="text-sm text-neutral-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
