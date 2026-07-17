import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import TrashClient from "@/components/TrashClient";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: trashedBookmarks, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_trashed", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching trashed bookmarks:", error);
  }

  return (
    <main className="min-h-screen w-full max-w-6xl mx-auto p-4 md:p-8 flex flex-col">
      <header className="flex items-center gap-4 py-6 mb-4 border-b border-neutral-200 dark:border-neutral-800">
        <Link 
          href="/settings" 
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex items-center gap-3">
          <Trash2 className="w-6 h-6 text-neutral-900 dark:text-white" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Trash Bin</h1>
        </div>
      </header>

      <div className="flex-1">
        <TrashClient bookmarks={trashedBookmarks || []} />
      </div>
    </main>
  );
}
