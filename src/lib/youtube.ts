const YT_CATEGORY_MAP: Record<string, string> = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music',
  '15': 'Pets & Animals', '17': 'Sports', '18': 'Short Movies',
  '19': 'Travel & Events', '20': 'Gaming', '22': 'People & Blogs',
  '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics',
  '26': 'Howto & Style', '27': 'Education', '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
};

function parseDuration(iso: string): number | null {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
}

export type YouTubeVideoItem = {
  snippet?: {
    title?: string;
    publishedAt?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    channelTitle?: string;
    thumbnails?: Partial<Record<'high' | 'medium' | 'default', { url?: string }>>;
  };
  contentDetails?: { duration?: string };
};

export type VideoMetadata = {
  title: string | null;
  thumbnail: string | null;
  published_at: string | null;
  description: string | null;
  tags: string[];
  category: string;
  channel_name: string | null;
  duration_seconds: number | null;
};

// Extracts the fields we store from a YouTube Data API videos.list item
export function parseVideoMetadata(item: YouTubeVideoItem): VideoMetadata {
  const thumbs = item.snippet?.thumbnails;
  return {
    title: item.snippet?.title || null,
    thumbnail: thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || null,
    published_at: item.snippet?.publishedAt || null,
    description: item.snippet?.description || null,
    tags: item.snippet?.tags || [],
    category: YT_CATEGORY_MAP[item.snippet?.categoryId ?? ''] || 'Uncategorized',
    channel_name: item.snippet?.channelTitle || null,
    duration_seconds: parseDuration(item.contentDetails?.duration || ''),
  };
}

// Translates texts to lowercase English via the Google Translate API.
// Returns [] when the key is missing, the input is empty, or the call fails.
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (texts.length === 0 || !GOOGLE_TRANSLATE_API_KEY) return [];
  try {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: texts, target: 'en', format: 'text' }),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.translations?.map((t: { translatedText: string }) =>
      t.translatedText.toLowerCase().trim()
    ) || [];
  } catch (e) {
    console.error('[translate] Failed:', e);
    return [];
  }
}
