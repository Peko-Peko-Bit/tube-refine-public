"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function trashBookmarks(bookmarkIds: string[]) {
  if (!bookmarkIds || bookmarkIds.length === 0) return { success: false };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from('bookmarks')
    .update({ is_trashed: true })
    .in('id', bookmarkIds)
    .eq('user_id', user.id);

  if (error) {
    console.error("Error trashing bookmarks:", error);
    throw new Error("Failed to delete bookmarks");
  }

  revalidatePath("/");
  return { success: true };
}

export async function restoreBookmarks(ids: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("bookmarks")
    .update({ is_trashed: false })
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error restoring bookmarks:", error);
    throw new Error("Failed to restore bookmarks");
  }

  revalidatePath("/trash");
  revalidatePath("/");
  return { success: true };
}

export async function hardDeleteBookmarks(ids: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error hard deleting bookmarks:", error);
    throw new Error("Failed to permanently delete bookmarks");
  }

  revalidatePath("/trash");
  return { success: true };
}
