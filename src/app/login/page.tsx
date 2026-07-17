import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookmarkIcon } from "lucide-react";
import LoginButton from "@/components/LoginButton";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-6 gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-neutral-900 dark:bg-white flex items-center justify-center shadow-sm">
          <BookmarkIcon className="w-8 h-8 text-white dark:text-neutral-900" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
          TubeRefine
        </h1>
        <p className="text-neutral-500 max-w-xs">
          Save YouTube videos and let AI organize them with tags and summaries.
        </p>
      </div>

      <LoginButton />
    </main>
  );
}
