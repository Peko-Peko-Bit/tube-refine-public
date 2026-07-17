"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "@/lib/types/database";
import BookmarkCard from "@/components/BookmarkCard";

import ProfileMenu from "@/components/ProfileMenu";
import { BookmarkIcon, Trash2, X, AlertTriangle, LayoutGrid, List, Search, SlidersHorizontal, ChevronDown, ArrowUp, ArrowDown } from "lucide-react";
import { trashBookmarks } from "@/app/actions";
import BottomNav from "@/components/BottomNav";

export default function DashboardClient({ 
  bookmarks, 
  avatarUrl 
}: { 
  bookmarks: Bookmark[]; 
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState("");

  // Filter & Sort state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'videos' | 'shorts'>('all');
  const [filterDuration, setFilterDuration] = useState('any');
  const [filterUploadedDate, setFilterUploadedDate] = useState('any');
  const [filterRating, setFilterRating] = useState('any');
  const [sortUploadedDate, setSortUploadedDate] = useState<'asc' | 'desc' | null>(null);
  const [sortAddedDate, setSortAddedDate] = useState<'asc' | 'desc' | null>('desc');
  const [sortRating, setSortRating] = useState<'asc' | 'desc' | null>(null);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());

  const isFiltered = filterType !== 'all' || filterDuration !== 'any' || filterUploadedDate !== 'any' || filterRating !== 'any' || sortUploadedDate !== null || sortAddedDate !== 'desc' || sortRating !== null;

  // Single poller while any bookmark is analyzing. The server marks pending
  // rows older than 5 minutes as failed, so this always terminates.
  const hasPending = bookmarks.some(b => b.ai_status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [hasPending, router]);

  // Compute quick-filter chips via round-robin (cat → ch → tag → cat → ...)
  const quickChips = useMemo(() => {
    const countMap = <T extends string>(vals: (T | null | undefined)[]) => {
      const m = new Map<string, number>();
      for (const v of vals) { if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    const cats = countMap(bookmarks.map(b => b.category)).slice(0, 8).map(([v]) => ({ key: `cat:${v}`, label: v }));
    const chs  = countMap(bookmarks.map(b => b.channel_name)).slice(0, 8).map(([v]) => ({ key: `ch:${v}`, label: v }));
    const tags = countMap(bookmarks.flatMap(b => [...(b.tags_ai || []), ...(b.user_tags || [])])).slice(0, 8).map(([v]) => ({ key: `tag:${v}`, label: `#${v}` }));

    // Round-robin interleave, cap at 20
    const chips: { key: string; label: string }[] = [];
    const max = Math.max(cats.length, chs.length, tags.length);
    for (let i = 0; i < max && chips.length < 20; i++) {
      if (cats[i] && chips.length < 20) chips.push(cats[i]);
      if (chs[i]  && chips.length < 20) chips.push(chs[i]);
      if (tags[i] && chips.length < 20) chips.push(tags[i]);
    }
    return chips;
  }, [bookmarks]);

  const toggleChip = (key: string) => {
    setSelectedChips(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedIds(new Set());
    setShowConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await trashBookmarks(Array.from(selectedIds));
      setIsSelectMode(false);
      setSelectedIds(new Set());
      setShowConfirm(false);
    } catch (error) {
      console.error("Failed to delete", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredBookmarks = (() => {
    let result = bookmarks || [];

    // Quick chip filter (OR within selection)
    if (selectedChips.size > 0) {
      result = result.filter(b =>
        [...selectedChips].some(key => {
          const [type, ...rest] = key.split(':');
          const val = rest.join(':');
          if (type === 'cat') return b.category === val;
          if (type === 'ch')  return b.channel_name === val;
          if (type === 'tag') return b.tags_ai?.includes(val) || b.user_tags?.includes(val);
          return false;
        })
      );
    }

    // Keyword search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(b =>
        b.title?.toLowerCase().includes(query) ||
        b.description_summary?.toLowerCase().includes(query) ||
        b.tags?.some(tag => tag.toLowerCase().includes(query.replace('#', ''))) ||
        b.tags_en?.some(tag => tag.toLowerCase().includes(query.replace('#', ''))) ||
        b.tags_ai?.some(tag => tag.toLowerCase().includes(query.replace('#', ''))) ||
        b.tags_ai_en?.some(tag => tag.toLowerCase().includes(query.replace('#', ''))) ||
        b.user_tags?.some(tag => tag.toLowerCase().includes(query.replace('#', ''))) ||
        b.channel_name?.toLowerCase().includes(query) ||
        b.category?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (filterType === 'videos') result = result.filter(b => !b.url.includes('/shorts/'));
    if (filterType === 'shorts') result = result.filter(b => b.url.includes('/shorts/'));

    // Duration filter
    if (filterDuration !== 'any') {
      result = result.filter(b => {
        const d = b.duration_seconds || 0;
        if (filterDuration === 'under3') return d < 180;
        if (filterDuration === '3to20') return d >= 180 && d <= 1200;
        if (filterDuration === '20to60') return d > 1200 && d <= 3600;
        if (filterDuration === 'over60') return d > 3600;
        if (filterDuration === 'over2h') return d > 7200;
        return true;
      });
    }

    // Uploaded Date filter
    if (filterUploadedDate !== 'any') {
      const now = new Date().getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      result = result.filter(b => {
        if (!b.published_at) return false;
        const pub = new Date(b.published_at).getTime();
        if (filterUploadedDate === 'today') return (now - pub) < dayMs;
        if (filterUploadedDate === 'thisweek') return (now - pub) < dayMs * 7;
        if (filterUploadedDate === 'thismonth') return (now - pub) < dayMs * 30;
        if (filterUploadedDate === 'thisyear') return (now - pub) < dayMs * 365;
        return true;
      });
    }

    // Rating filter
    if (filterRating !== 'any') {
      result = result.filter(b => {
        const stars = b.rating !== null ? Math.round(b.rating / 20) : 0;
        if (filterRating === '3plus') return stars >= 3;
        if (filterRating === '4plus') return stars >= 4;
        if (filterRating === '5only') return stars === 5;
        return true;
      });
    }

    // Sort
    if (sortRating) {
      result = [...result].sort((a, b) =>
        sortRating === 'desc'
          ? (b.rating ?? -1) - (a.rating ?? -1)
          : (a.rating ?? 101) - (b.rating ?? 101)
      );
    } else if (sortUploadedDate) {
      result = [...result].sort((a, b) => {
        const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
        return sortUploadedDate === 'asc' ? timeA - timeB : timeB - timeA;
      });
    } else if (sortAddedDate) {
      result = [...result].sort((a, b) =>
        sortAddedDate === 'asc'
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return result;
  })();

  const shorts = filteredBookmarks.filter(b => b.url.includes('/shorts/'));
  const normalVideos = filteredBookmarks.filter(b => !b.url.includes('/shorts/'));

  return (
    <main className="min-h-screen w-full max-w-5xl mx-auto p-4 pb-24 md:p-8 md:pb-24 flex flex-col relative">
      <header className="flex items-center justify-between py-6 mb-8 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <BookmarkIcon className="w-6 h-6 text-neutral-900 dark:text-white" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">TubeRefine</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <ProfileMenu avatarUrl={avatarUrl} />
        </div>
      </header>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 max-w-md w-full shadow-xl border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Delete Bookmarks</h3>
                <p className="text-sm text-neutral-500">
                  Are you sure you want to move {selectedIds.size} item(s) to the trash?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {isDeleting ? "Deleting..." : "Move to Trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSelectMode && selectedIds.size > 0 && !showConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-6 py-4 rounded-2xl shadow-xl z-40 flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowFilterModal(false)}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Filter & Sort</h2>
              <button onClick={() => setShowFilterModal(false)} className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5">
              {/* FILTERS SECTION */}
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Filters</p>
                <div className="flex flex-col gap-3">
                  {/* Type */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Type</label>
                    <div className="relative">
                      <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value as any)}
                        className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All</option>
                        <option value="videos">Videos</option>
                        <option value="shorts">Shorts</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Duration</label>
                    <div className="relative">
                      <select
                        value={filterDuration}
                        onChange={e => setFilterDuration(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="any">Any</option>
                        <option value="under3">Under 3 minutes</option>
                        <option value="3to20">3 – 20 minutes</option>
                        <option value="20to60">20 – 60 minutes</option>
                        <option value="over60">Over 60 minutes</option>
                        <option value="over2h">Over 2 hours</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Uploaded date */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Uploaded date</label>
                    <div className="relative">
                      <select
                        value={filterUploadedDate}
                        onChange={e => setFilterUploadedDate(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="any">Any</option>
                        <option value="today">Today</option>
                        <option value="thisweek">This week</option>
                        <option value="thismonth">This month</option>
                        <option value="thisyear">This year</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Rating</label>
                    <div className="relative">
                      <select
                        value={filterRating}
                        onChange={e => setFilterRating(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="any">Any</option>
                        <option value="3plus">★ 3+</option>
                        <option value="4plus">★ 4+</option>
                        <option value="5only">★ 5 only</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

              {/* SORT SECTION */}
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Sort</p>
                <div className="flex flex-col gap-3">
                  {/* Sort by Uploaded date */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Uploaded date</label>
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                      {(['asc', 'desc'] as const).map(dir => (
                        <button
                          key={dir}
                          onClick={() => {
                            setSortUploadedDate(dir);
                            setSortAddedDate(null);
                            setSortRating(null);
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            sortUploadedDate === dir
                              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                          }`}
                        >
                          {dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          {dir === 'asc' ? 'Oldest' : 'Newest'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort by Added date */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Added date</label>
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                      {(['asc', 'desc'] as const).map(dir => (
                        <button
                          key={dir}
                          onClick={() => { setSortAddedDate(dir); setSortUploadedDate(null); setSortRating(null); }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            sortAddedDate === dir
                              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                          }`}
                        >
                          {dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          {dir === 'asc' ? 'Oldest' : 'Newest'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort by Rating */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Rating</label>
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                      {(['desc', 'asc'] as const).map(dir => (
                        <button
                          key={dir}
                          onClick={() => { setSortRating(dir); setSortUploadedDate(null); setSortAddedDate(null); }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            sortRating === dir
                              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                          }`}
                        >
                          {dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                          {dir === 'desc' ? 'High' : 'Low'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <button
                onClick={() => {
                  setFilterType('all');
                  setFilterDuration('any');
                  setFilterUploadedDate('any');
                  setFilterRating('any');
                  setSortUploadedDate(null);
                  setSortAddedDate('desc');
                  setSortRating(null);
                }}
                className="w-full py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 border border-neutral-200 dark:border-neutral-700 rounded-xl transition-colors"
              >
                Reset all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-filter chip bar */}
      {quickChips.length > 0 && (
        <div className="flex items-center gap-2 mb-3 -mx-4 px-4 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedChips(new Set())}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              selectedChips.size === 0
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            All
          </button>
          {quickChips.map(chip => (
            <button
              key={chip.key}
              onClick={() => toggleChip(chip.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                selectedChips.has(chip.key)
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Search UI */}
      <div className="w-full mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-neutral-400" />
          </div>
          <input
            type="text"
            placeholder="Search by title, summary, or #tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-11 pr-10 py-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Filter Icon Button */}
        <button
          onClick={() => setShowFilterModal(true)}
          className={`relative shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-all shadow-sm ${
            isFiltered
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
          title="Filter & Sort"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {isFiltered && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
          )}
        </button>
      </div>

      {/* View Toggle */}
      {bookmarks && bookmarks.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          {/* Delete / Select button - left */}
          <button
            onClick={toggleSelectMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSelectMode
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title="Select to delete"
          >
            {isSelectMode ? <X className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            <span>{isSelectMode ? 'Cancel' : 'Select'}</span>
          </button>

          {/* Grid/List toggle - right */}
          <div className="bg-neutral-100 dark:bg-neutral-900 p-1 rounded-lg inline-flex items-center border border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {(!bookmarks || bookmarks.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-700">
            <BookmarkIcon className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">No bookmarks yet</h2>
          <p className="text-neutral-500 max-w-sm">
            Use the share menu in the YouTube app and select TubeRefine to save your first video.
          </p>
        </div>
      ) : filteredBookmarks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-700">
            <Search className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">No results found</h2>
          <p className="text-neutral-500 max-w-sm">
            No bookmarks match &ldquo;{searchQuery}&rdquo;. Try a different keyword or tag.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${isSelectMode ? 'pb-24' : ''}`}>
          {filteredBookmarks.map((b) => (
            <BookmarkCard 
              key={b.id} 
              bookmark={b} 
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(b.id)}
              onSelect={handleSelect}
              layout="grid"
            />
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className={`flex flex-col gap-10 ${isSelectMode ? 'pb-24' : ''}`}>
          {/* Shorts Carousel */}
          {shorts.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 px-1">Shorts</h2>
              <div className="flex overflow-x-auto gap-4 pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {shorts.map((b) => (
                  <div key={b.id} className="snap-start">
                    <BookmarkCard 
                      bookmark={b} 
                      isSelectMode={isSelectMode}
                      isSelected={selectedIds.has(b.id)}
                      onSelect={handleSelect}
                      layout="short"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Normal Videos List */}
          {normalVideos.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 px-1">Videos</h2>
              <div className="flex flex-col gap-4">
                {normalVideos.map((b) => (
                  <BookmarkCard 
                    key={b.id} 
                    bookmark={b} 
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.has(b.id)}
                    onSelect={handleSelect}
                    layout="list"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
