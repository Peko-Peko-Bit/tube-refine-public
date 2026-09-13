import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookmarkIcon } from "lucide-react";
import LoginButton from "@/components/LoginButton";
import GuestButton from "@/components/GuestButton";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed:
    "Google sign-in is limited to approved accounts. Try the app as a guest instead.",
  auth: "Something went wrong while signing you in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : undefined;

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

      {message && (
        <p
          role="alert"
          className="max-w-xs text-center text-sm text-amber-700 dark:text-amber-400"
        >
          {message}
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <LoginButton />
        <GuestButton />
        <p className="text-xs text-neutral-500">
          Guest data is deleted after 24 hours.
        </p>
      </div>
    </main>
  );
}
