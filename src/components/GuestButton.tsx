"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function GuestButton() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGuestLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error("Guest sign-in failed:", error);
      setLoading(false);
      return;
    }

    // Hard navigation so the server components pick up the new session cookie.
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleGuestLogin}
      disabled={loading}
      className="flex items-center gap-3 px-6 py-3.5 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all font-medium cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
      <span>Try as guest</span>
    </button>
  );
}
