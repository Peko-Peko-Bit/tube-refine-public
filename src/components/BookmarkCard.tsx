"use client";

import { Bookmark } from "@/lib/types/database";
import { ExternalLink, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import VideoSummaryPanel from "@/components/VideoSummaryPanel";

function StarRating({ bookmarkId, rating }: { bookmarkId: string; rating: number | null }) {
  const [localRating, setLocalRating] = useState<number | null>(rating);
  const [hovered, setHovered] = useState<number | null>(null);

  const currentStars = localRating !== null ? Math.round(localRating / 20) : 0;
  const displayStars = hovered ?? currentStars;

  const handleClick = async (star: number) => {
    const newRating = currentStars === star ? null : star * 20;
    setLocalRating(newRating);
    await fetch(`/api/bookmarks/${bookmarkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: newRating }),
    });
  };

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={(e) => { e.stopPropagation(); handleClick(star); }}
          onMouseEnter={() => setHovered(star)}
          className="p-0.5 transition-transform hover:scale-110"
          title={`Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          <Star
            className={`w-3.5 h-3.5 transition-colors ${
              star <= displayStars
                ? 'fill-amber-400 text-amber-400'
                : 'text-neutral-300 dark:text-neutral-600'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPublishedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

export default function BookmarkCard({
  bookmark,
  isSelectMode,
  isSelected,
  onSelect,
  layout = 'grid'
}: {
  bookmark: Bookmark;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  layout?: 'grid' | 'list' | 'short';
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Surfaces the reason a request was turned down (rate limits, mainly) instead
  // of leaving the button looking like it did nothing.
  const readError = async (res: Response) => {
    try {
      const data = await res.json();
      setActionError(data.error || "Something went wrong. Please try again.");
    } catch {
      setActionError("Something went wrong. Please try again.");
    }
  };

  const handleRetry = async () => {
    setActionError(null);
    const res = await fetch(`/api/bookmarks/${bookmark.id}/retry`, { method: "POST" });
    if (res.ok) router.refresh();
    else await readError(res);
  };

  const handleRefetch = async () => {
    setIsRefetching(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}/refetch`, { method: "POST" });
      if (res.ok) router.refresh();
      else await readError(res);
    } finally {
      setIsRefetching(false);
    }
  };

  const isList = layout === 'list';
  const isShort = layout === 'short';

  return (
    <>
      <div
        onClick={() => isSelectMode && onSelect && onSelect(bookmark.id)}
        className={`relative border rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md ${isSelectMode ? 'cursor-pointer' : ''} ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-neutral-200 dark:border-neutral-800'} ${isList ? 'flex flex-row min-h-24 sm:min-h-32' : isShort ? 'flex flex-col w-36 sm:w-44 shrink-0' : 'flex flex-col'}`}
      >
        {/* Thumbnail */}
        <div className={`relative bg-neutral-100 dark:bg-neutral-950 overflow-hidden shrink-0 ${isList ? 'w-36 sm:w-48 self-stretch' : isShort ? 'w-full aspect-[9/16]' : 'w-full aspect-video'}`}>
          {bookmark.thumbnail ? (
            <img
              src={bookmark.thumbnail}
              alt={bookmark.title || "Thumbnail"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
              No Thumbnail
            </div>
          )}

          {/* Category Badge overlay */}
          {bookmark.category && bookmark.ai_status === 'done' && !isSelectMode && !isList && !isShort && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 backdrop-blur text-white text-[10px] sm:text-xs font-medium rounded-md z-10">
              {bookmark.category}
            </div>
          )}

          {/* Duration Badge - bottom right of thumbnail */}
          {bookmark.duration_seconds != null && bookmark.duration_seconds > 0 && !isSelectMode && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-white text-[10px] font-medium rounded z-10 tabular-nums">
              {formatDuration(bookmark.duration_seconds)}
            </div>
          )}

          {/* Selection UI */}
          {isSelectMode && (
            <div className="absolute inset-0 bg-black/20 z-10 flex items-start justify-end p-2 transition-colors hover:bg-black/30">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-white/80 bg-black/20'}`}>
                {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            </div>
          )}
        </div>

        <div className={`p-3 flex flex-col flex-1 gap-1.5 ${isShort ? 'p-2' : ''}`}>
          {/* Title + action buttons */}
          <div className="flex items-start justify-between gap-2">
            <h3 className={`font-semibold text-neutral-900 dark:text-neutral-100 leading-tight ${isShort ? 'text-xs sm:text-sm line-clamp-2' : 'text-sm sm:text-base line-clamp-2'}`}>
              {bookmark.title || "Unknown Title"}
            </h3>
            {!isShort && (
              <div className="flex items-center gap-1 shrink-0">
                {/* Video Summary button */}
                {!isSelectMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsSummaryOpen(true); }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 transition-colors whitespace-nowrap"
                    title={bookmark.video_summary ? "View video summary" : "Generate video summary"}
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    {bookmark.video_summary ? 'View Summary' : 'Generate Summary'}
                  </button>
                )}

                {/* Description summary toggle */}
                {bookmark.description_summary && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                    className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors bg-neutral-50 dark:bg-neutral-800 rounded-md"
                    title={isExpanded ? "Hide Summary" : "Show Summary"}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}

                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => isSelectMode && e.preventDefault()}
                  className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  title="Open on YouTube"
                >
                  <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                </a>
              </div>
            )}
          </div>

          {/* Channel name · Published date · Refetch button */}
          {!isShort && (bookmark.channel_name || bookmark.published_at) && (
            <div className="flex items-center gap-1 min-w-0">
              {bookmark.channel_name && (
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-none truncate">
                  {bookmark.channel_name}
                </span>
              )}
              {bookmark.published_at && (
                <>
                  <span className="text-[11px] text-neutral-300 dark:text-neutral-600 shrink-0">·</span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-none shrink-0">
                    {formatPublishedAt(bookmark.published_at)}
                  </span>
                </>
              )}
              {!isSelectMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRefetch(); }}
                  disabled={isRefetching}
                  className="ml-auto shrink-0 p-1 text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-400 transition-colors disabled:opacity-40"
                  title="Re-fetch YouTube metadata"
                >
                  <RotateCcw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          )}

          {/* AI status indicators */}
          {bookmark.ai_status === 'pending' && (
            <div className="flex-1 flex flex-col justify-center mt-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 self-start px-2 py-1 rounded-full">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Analyzing...</span>
              </div>
            </div>
          )}

          {bookmark.ai_status === 'failed' && (
            <div className="flex-1 flex flex-col justify-center gap-1 mt-1">
              <span className="text-xs text-red-500">Analysis failed</span>
              <button onClick={handleRetry} className="text-xs text-neutral-500 underline self-start hover:text-black dark:hover:text-white">Retry</button>
            </div>
          )}

          {actionError && (
            <p role="alert" className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              {actionError}
            </p>
          )}

          {!isShort && !isSelectMode && (
            <StarRating bookmarkId={bookmark.id} rating={bookmark.rating} />
          )}

          {bookmark.ai_status === 'done' && !isShort && (
            <div className="flex flex-col gap-1.5 flex-1 justify-end mt-1">
              {/* Description summary (expanded) */}
              {bookmark.description_summary && isExpanded && (
                <div className="mb-1.5 p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-lg text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed border border-neutral-100 dark:border-neutral-800 animate-in fade-in slide-in-from-top-1">
                  {bookmark.description_summary}
                </div>
              )}

              {/* Tags — user_tags first (violet), then YouTube (grey), then AI (blue); deduped by lowercase */}
              {(() => {
                const seen = new Set<string>();
                const dedup = (tag: string) => {
                  const key = tag.toLowerCase();
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                };
                const userTags = (bookmark.user_tags || []).filter(dedup);
                const ytTags = (bookmark.tags || []).filter(dedup).slice(0, isList ? 3 : 4);
                const aiTags = (bookmark.tags_ai || []).filter(dedup).slice(0, 2);
                if (!userTags.length && !ytTags.length && !aiTags.length) return null;
                return (
                  <div className="flex flex-wrap gap-1 overflow-hidden h-5">
                    {userTags.map((tag, idx) => (
                      <span key={`u-${idx}`} className="px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] rounded whitespace-nowrap border border-violet-200 dark:border-violet-700/50">
                        #{tag}
                      </span>
                    ))}
                    {ytTags.map((tag, idx) => (
                      <span key={`yt-${idx}`} className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] rounded whitespace-nowrap">
                        #{tag}
                      </span>
                    ))}
                    {aiTags.map((tag, idx) => (
                      <span key={`ai-${idx}`} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] rounded whitespace-nowrap border border-blue-100 dark:border-blue-800/50">
                        #{tag}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Video Summary Panel (portal) */}
      <VideoSummaryPanel
        bookmark={bookmark}
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
      />
    </>
  );
}
