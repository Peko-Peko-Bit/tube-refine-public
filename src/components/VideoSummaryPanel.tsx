"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bookmark } from "@/lib/types/database";
import { readSummaryLanguage } from "@/lib/video-summary";

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function linkifyTimestamps(text: string, videoId: string): string {
  return text.replace(/\((\d{1,2}:\d{2}(?::\d{2})?)\)/g, (_, ts) => {
    const seconds = timestampToSeconds(ts);
    return `[(${ts})](https://www.youtube.com/watch?v=${videoId}&t=${seconds}s)`;
  });
}

export default function VideoSummaryPanel({
  bookmark,
  isOpen,
  onClose,
}: {
  bookmark: Bookmark;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<string | null>(bookmark.video_summary);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  // Sync from prop after router.refresh()
  useEffect(() => {
    if (bookmark.video_summary) setSummary(bookmark.video_summary);
  }, [bookmark.video_summary]);

  // Auto-generate when panel opens with no summary
  useEffect(() => {
    if (!isOpen) return;
    if (bookmark.video_summary) {
      setSummary(bookmark.video_summary);
    } else {
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const generate = async (force: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      // Read at call time rather than from state: the picker lives in the
      // profile menu, so the preference can change while this panel is mounted.
      const query = new URLSearchParams({ lang: readSummaryLanguage() });
      if (force) query.set('force', 'true');
      const url = `/api/bookmarks/${bookmark.id}/summarize?${query}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate summary');
      setSummary(data.summary);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white dark:bg-neutral-900 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <span className="text-sm font-semibold text-neutral-900 dark:text-white absolute left-1/2 -translate-x-1/2 pointer-events-none">
          Video Summary
        </span>

        <button
          onClick={() => generate(true)}
          disabled={isLoading}
          className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          title="Regenerate summary"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 border-[3px] border-neutral-200 dark:border-neutral-700 border-t-neutral-600 dark:border-t-neutral-300 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500">Summarizing...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => generate(false)}
              className="text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && summary && (
          <div className="max-w-3xl mx-auto px-5 py-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-1 leading-snug">
              {bookmark.title}
            </h2>
            {bookmark.channel_name && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                {bookmark.channel_name}
              </p>
            )}
            <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 text-xs font-mono hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                      {children}
                    </a>
                  ),
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mt-6 mb-3 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold text-neutral-900 dark:text-white mt-6 mb-2 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-100 mt-4 mb-1.5">{children}</h3>,
                  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-4 space-y-1.5 list-none pl-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-4 space-y-1.5 list-decimal pl-5">{children}</ol>,
                  li: ({ children }) => (
                    <li className="flex gap-2 leading-relaxed">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
                      <span>{children}</span>
                    </li>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-neutral-900 dark:text-white">{children}</strong>,
                  em: ({ children }) => <em className="italic text-neutral-600 dark:text-neutral-400">{children}</em>,
                  hr: () => <hr className="my-5 border-neutral-200 dark:border-neutral-700" />,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-neutral-300 dark:border-neutral-600 pl-4 my-3 text-neutral-600 dark:text-neutral-400 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {linkifyTimestamps(summary, bookmark.video_id)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
