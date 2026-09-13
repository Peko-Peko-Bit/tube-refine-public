"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Globe, Settings, LogOut, User, Check, ChevronDown } from "lucide-react";
import {
  DEFAULT_SUMMARY_LANGUAGE,
  SUMMARY_LANGUAGE_OPTIONS,
  SummaryLanguage,
  readSummaryLanguage,
  writeSummaryLanguage,
} from "@/lib/video-summary";

export default function ProfileMenu({ avatarUrl }: { avatarUrl?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [summaryLang, setSummaryLang] = useState<SummaryLanguage>(DEFAULT_SUMMARY_LANGUAGE);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Read on open rather than on mount: the stored value is per-device, so
  // rendering it before the menu is opened would mismatch the server HTML.
  const openMenu = () => {
    setSummaryLang(readSummaryLanguage());
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setIsLangOpen(false);
  };

  const selectSummaryLang = (lang: SummaryLanguage) => {
    setSummaryLang(lang);
    writeSummaryLanguage(lang);
    setIsLangOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="w-9 h-9 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition-all hover:opacity-80"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-500">
            <User className="w-5 h-5" />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <button
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            onClick={() => setIsLangOpen(!isLangOpen)}
            aria-expanded={isLangOpen}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Lang (Summary)</span>
            <span className="text-xs text-neutral-500">
              {SUMMARY_LANGUAGE_OPTIONS.find((o) => o.code === summaryLang)?.label}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isLangOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isLangOpen && (
            <div className="bg-neutral-50 dark:bg-neutral-800/50 border-y border-neutral-200 dark:border-neutral-800 py-1">
              {SUMMARY_LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  onClick={() => selectSummaryLang(option.code)}
                  className="w-full flex items-center gap-3 pl-11 pr-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <span className="flex-1 text-left">{option.label}</span>
                  {option.code === summaryLang && <Check className="w-4 h-4 shrink-0" />}
                </button>
              ))}
              <p className="px-4 pl-11 pt-1 pb-1.5 text-[11px] leading-snug text-neutral-500">
                Applies to newly generated summaries. Regenerate to switch an existing one.
              </p>
            </div>
          )}

          <button
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            onClick={() => {
              closeMenu();
              router.push("/settings");
            }}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          
          <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-2" />
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
