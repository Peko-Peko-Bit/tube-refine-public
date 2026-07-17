"use client";

import { useState } from "react";
import { Bookmark } from "@/lib/types/database";
import BookmarkCard from "./BookmarkCard";
import { restoreBookmarks, hardDeleteBookmarks } from "@/app/actions";
import { Trash2, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";

export default function TrashClient({ bookmarks }: { bookmarks: Bookmark[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    if (next.size === 0) setIsSelectMode(false);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === bookmarks.length) {
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } else {
      setSelectedIds(new Set(bookmarks.map(b => b.id)));
    }
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsRestoring(true);
    try {
      await restoreBookmarks(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } catch (e) {
      console.error(e);
      alert("Failed to restore items");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleHardDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      await hardDeleteBookmarks(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error(e);
      alert("Failed to permanently delete items");
    } finally {
      setIsDeleting(false);
    }
  };

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400 gap-3">
        <Trash2 className="w-12 h-12 opacity-20" />
        <p>Your trash bin is empty.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-neutral-500">
          {bookmarks.length} item{bookmarks.length === 1 ? '' : 's'} in trash
        </p>
        <button
          onClick={() => {
            if (isSelectMode) {
              setSelectedIds(new Set());
              setIsSelectMode(false);
            } else {
              setIsSelectMode(true);
            }
          }}
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          {isSelectMode ? "Cancel" : "Select"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {bookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            layout="grid"
            isSelectMode={isSelectMode}
            isSelected={selectedIds.has(bookmark.id)}
            onSelect={toggleSelection}
          />
        ))}
      </div>

      {/* Action Bar */}
      {isSelectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full px-6 py-3 shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 z-50">
          <div className="flex items-center gap-3 border-r border-neutral-700 dark:border-neutral-200 pr-6">
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <button 
              onClick={handleSelectAll}
              className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-white dark:hover:text-black underline"
            >
              Select All
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestore}
              disabled={isRestoring || selectedIds.size === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              <span className="text-sm font-medium">Restore</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Delete Forever</span>
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-center text-neutral-900 dark:text-white mb-2">
              Permanently delete items?
            </h3>
            <p className="text-sm text-center text-neutral-500 dark:text-neutral-400 mb-6">
              You are about to permanently delete {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}. This action cannot be undone.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleHardDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
