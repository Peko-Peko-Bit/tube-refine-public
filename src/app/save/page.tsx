"use client";

import { useEffect, useState, Suspense, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X, Check, ExternalLink } from "lucide-react";

function extractUrl(params: URLSearchParams): string | null {
  const urlParam = params.get('url');
  if (urlParam) return urlParam;
  const text = params.get('text') || '';
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function ShareModal() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [titleLoading, setTitleLoading] = useState(true);
  const [userTags, setUserTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = extractUrl(searchParams);
    if (!url) { setError('No valid URL found in the shared data.'); setTitleLoading(false); return; }
    setVideoUrl(url);

    // Try to get title from share params first, then oEmbed
    const paramTitle = searchParams.get('title');
    if (paramTitle) { setTitle(paramTitle); setTitleLoading(false); return; }

    const match = url.match(/[?&]v=([^"&?/\s]{11})|youtu\.be\/([^"&?/\s]{11})|\/shorts\/([^"&?/\s]{11})/);
    const videoId = match?.[1] || match?.[2] || match?.[3];
    if (!videoId) { setTitleLoading(false); return; }

    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.title) setTitle(d.title); })
      .catch(() => {})
      .finally(() => setTitleLoading(false));
  }, [searchParams]);

  const addTag = (value: string) => {
    const tag = value.trim().replace(/^#/, '');
    if (!tag) return;
    setUserTags(prev => prev.map(t => t.toLowerCase()).includes(tag.toLowerCase()) ? prev : [...prev, tag]);
    setTagInput('');
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
  };

  const handleSave = async () => {
    if (!videoUrl) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl, user_tags: userTags }),
      });
      if (res.status === 401) {
        // Session fully expired — have the user sign in, then share again
        router.push('/login');
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => { try { window.close(); } catch {} router.push('/'); }, 1200);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col justify-end bg-black/60">
      <div className="bg-white dark:bg-neutral-900 rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-4 shadow-2xl">
        {/* Handle bar */}
        <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700 mx-auto -mt-1 mb-1" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {titleLoading ? (
              <div className="h-6 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            ) : (
              <h2 className="text-base font-bold text-neutral-900 dark:text-white leading-snug line-clamp-2">
                {title || 'YouTube Video'}
              </h2>
            )}
            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-1 text-xs text-neutral-400 truncate hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{videoUrl}</span>
              </a>
            )}
          </div>
        </div>

        {/* Tag input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Tags (optional)</label>
          {userTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {userTags.map((tag, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs border border-violet-200 dark:border-violet-700/50">
                  #{tag}
                  <button onClick={() => setUserTags(prev => prev.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Press Enter to add..."
            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || saved || !videoUrl}
          className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-50'
          }`}
        >
          {saved ? (
            <><Check className="w-4 h-4" /> Saved!</>
          ) : saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            'Add to TubeRefine'
          )}
        </button>
      </div>
    </div>
  );
}

export default function SavePage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-black/60">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    }>
      <ShareModal />
    </Suspense>
  );
}
