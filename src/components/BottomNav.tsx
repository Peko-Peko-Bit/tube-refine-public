"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Video, ListMusic, Plus, X, Loader2, Link2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // --- Scroll-hide logic ---
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY.current;

      if (Math.abs(delta) < 8) return; // ignore tiny jitters

      if (delta > 0 && currentScrollY > 60) {
        // Scrolling down → hide
        setIsVisible(false);
      } else {
        // Scrolling up → show
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // --- Bottom sheet logic ---
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openSheet = () => {
    setIsSheetOpen(true);
    setError("");
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setUrl("");
    setError("");
    setUserTags([]);
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (!userTags.map(t => t.toLowerCase()).includes(trimmed.toLowerCase())) {
      setUserTags(prev => [...prev, trimmed]);
    }
    setTagInput("");
  };

  const removeTag = (index: number) => {
    setUserTags(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_tags: userTags }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add bookmark");
      }

      closeSheet();
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { href: "/", label: "Videos", icon: Video },
    { href: "/playlists", label: "Playlists", icon: ListMusic },
  ];

  return (
    <>
      {/* Bottom Sheet Backdrop */}
      {isSheetOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={closeSheet}
        />
      )}

      {/* Bottom Sheet Panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          isSheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Sheet Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        <div className="px-6 pb-10 pt-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Add Video</h2>
            <button
              onClick={closeSheet}
              className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* URL input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Link2 className="w-5 h-5 text-neutral-400" />
              </div>
              <input
                ref={inputRef}
                type="url"
                placeholder="Paste YouTube URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="block w-full pl-12 pr-4 py-3.5 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Tag input */}
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Add tags (press Enter to add)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="block w-full px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-sm"
              />
              {userTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {userTags.map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs rounded-full border border-violet-200 dark:border-violet-700/50"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removeTag(i)}
                        className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-violet-200 dark:hover:bg-violet-700/50 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500 pl-1 flex items-center gap-1">
                <span>⚠️</span> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !url}
              className="w-full py-3.5 rounded-xl font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
              ) : (
                <><Plus className="w-5 h-5" /> Save Video</>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Nav Bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Tab Bar */}
        <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 pb-safe">
          <div className="flex items-center h-16 max-w-md mx-auto">
            {/* Left tab - Videos */}
            <Link
              href={tabs[0].href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                pathname === tabs[0].href
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <Video className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tabs[0].label}</span>
            </Link>

            {/* Center FAB */}
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={openSheet}
                className="w-12 h-12 rounded-full bg-neutral-900 dark:bg-white hover:bg-neutral-700 dark:hover:bg-neutral-200 active:scale-95 text-white dark:text-neutral-900 shadow-md flex items-center justify-center transition-all duration-150"
                aria-label="Add video"
              >
                <Plus className="w-6 h-6" strokeWidth={2.5} />
              </button>
            </div>

            {/* Right tab - Playlists */}
            <Link
              href={tabs[1].href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                pathname === tabs[1].href
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <ListMusic className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tabs[1].label}</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
