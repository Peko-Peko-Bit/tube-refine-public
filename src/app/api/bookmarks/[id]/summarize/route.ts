import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// LLM generation can take well past the platform's default limit
export const maxDuration = 60;

function extractChapters(description: string): { time: string; title: string }[] | null {
  const tsRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;
  const chapters = description.split('\n').flatMap((line) => {
    const m = line.trim().match(tsRegex);
    return m ? [{ time: m[1], title: m[2].trim() }] : [];
  });
  return chapters.length >= 2 ? chapters : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    const { data: bookmark, error: fetchError } = await supabase
      .from('bookmarks')
      .select('id, video_id, url, title, channel_name, description, video_summary')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !bookmark) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Return cached summary if available and not forced
    if (bookmark.video_summary && !force) {
      return NextResponse.json({ summary: bookmark.video_summary });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'Missing API key configuration' }, { status: 500 });
    }

    // Extract chapters from description (lines like "0:00 Title" or "1:23:45 Title")
    const chapters = extractChapters(bookmark.description || '');

    const descriptionContext = bookmark.description
      ? `\n説明文（参考）:\n${bookmark.description.slice(0, 2000)}`
      : '';

    const chapterSection = chapters
      ? `\n\n【チャプター情報（以下の正確なタイムスタンプを使用すること）】\n${chapters.map((c: { time: string; title: string }) => `(${c.time}) ${c.title}`).join('\n')}`
      : '';

    const chapterPromptBlock = chapters
      ? `## チャプター
各チャプターについて以下の形式で記述する（タイムスタンプは末尾に付ける）:
### チャプタータイトル (00:00)
3〜5文で、そのセクションで投稿者が**何を主張・結論づけているか**を中心に記述する。
具体的な数値・事例・固有名詞・データは**太字**にして必ず含める。
「〜と述べています」「〜が紹介されます」などの紹介調は使わず、内容を直接記述する。`
      : `## 主なポイント
- ポイントを箇条書きで列挙（6〜10項目）
- 各項目は投稿者の**主張・結論**を一文で端的に記述する（紹介調・予告調は禁止）
- **重要な固有名詞・数値・データ**を太字にする

## 詳細
各ポイントについて3〜5文で掘り下げる。
- 投稿者が何を根拠にその主張をしているか
- 具体的な数値・事例・比較・実験結果があれば必ず含める
- 「動画では〜が紹介されます」ではなく「〜である／〜だ」と断定的に記述する`;

    const prompt = `以下のYouTube動画を視聴し、日本語で詳細な要約を作成してください。

動画URL: ${bookmark.url}
タイトル: ${bookmark.title || '不明'}
チャンネル: ${bookmark.channel_name || '不明'}${descriptionContext}${chapterSection}

【最重要原則】
- 動画URLに直接アクセスして動画本編を視聴・分析すること
- 「視聴を促す」「ネタバレを避ける」必要は一切ない。動画の結論・主張・データを全て明記すること
- 視聴者がこの要約を読めば動画を見なくても内容を完全に把握できるレベルの詳細さにすること
- 「承知しました」「要約します」などの前置き・確認文を一切書かないこと
- 下記フォーマットのMarkdownのみを出力すること${chapters ? '\n- タイムスタンプは上記チャプター情報の値をそのまま使用し、末尾に (MM:SS) 形式で付けること' : '\n- タイムスタンプは一切書かないこと'}
- 「〜が語られます」「〜が紹介されます」など予告・紹介調の表現は禁止。内容を直接記述すること

【出力フォーマット】

## 概要
4〜5文で、動画の中心的な主張・結論・テーマを説明する。
背景・問題提起・投稿者の立場も含める。

${chapterPromptBlock}

## まとめ
投稿者の最終的な結論・主張・提言を3〜5文で明記する。
「この動画では〜」ではなく「〜である」と断定して記述すること。`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Gemini models can ingest the actual video from the YouTube URL in the
        // prompt. Swapping to a non-Gemini model won't error — it silently
        // degrades to guessing from the title/description alone.
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter API error: ${res.statusText} — ${text}`);
    }

    const json = await res.json();
    const summary = json.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('Empty response from AI');
    }

    const { error: updateError } = await supabase
      .from('bookmarks')
      .update({ video_summary: summary })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to save summary: ${updateError.message}`);
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
