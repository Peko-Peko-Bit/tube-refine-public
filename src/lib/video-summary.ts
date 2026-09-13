/**
 * Video summary generation — the prompt and the model call, shared by the
 * on-demand route (`/api/bookmarks/[id]/summarize`) and the one-off script that
 * pre-generates summaries for the guest demo fixture
 * (`scripts/generate-demo-summaries.mts`), so the demo shows exactly what the
 * app produces.
 *
 * Written with erasable syntax only: the script runs it through Node's
 * TypeScript type stripping rather than a build step.
 */

// Gemini models can ingest the actual video from the YouTube URL in the prompt.
// Swapping to a non-Gemini model won't error — it silently degrades to guessing
// from the title/description alone.
export const SUMMARY_MODEL = 'google/gemini-2.5-flash-lite';

export const SUMMARY_LANGUAGES = ['ja', 'en', 'es'] as const;
export type SummaryLanguage = (typeof SUMMARY_LANGUAGES)[number];
export const DEFAULT_SUMMARY_LANGUAGE: SummaryLanguage = 'ja';

/** Guards the request parameter: anything unrecognised falls back to the default. */
export function isSummaryLanguage(value: unknown): value is SummaryLanguage {
  return typeof value === 'string' && (SUMMARY_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Everything the prompt needs in order to speak one language. The instructions
 * themselves stay in English — only the output language, the labels on the data
 * handed to the model, and the Markdown headings vary. Labels left in a fixed
 * language pull the output back towards that language, so they are localised
 * along with the headings.
 */
type LanguageSpec = {
  /** Shown in the picker. */
  menuLabel: string;
  /** How the prompt names the output language. */
  promptName: string;
  unknown: string;
  /**
   * The register rules, written in the output language. Stating them in English
   * measurably fails to bind: with an English-only version the Japanese output
   * slipped into 敬体 and the 紹介調 ("動画では〜が紹介されます") that the
   * original prompt existed to forbid.
   */
  style: string;
  fields: { url: string; title: string; channel: string; description: string; chapters: string };
  headings: {
    overview: string;
    chapters: string;
    keyPoints: string;
    details: string;
    conclusion: string;
  };
};

const LANGUAGES: Record<SummaryLanguage, LanguageSpec> = {
  ja: {
    menuLabel: '日本語',
    promptName: 'Japanese (日本語)',
    unknown: '不明',
    style:
      '常体（「〜である」「〜だ」）で断定して記述すること。敬体（「〜です」「〜ます」）は使わない。' +
      '「この動画では〜」「〜が紹介されます」「〜と語られます」のような紹介調・予告調は禁止で、内容そのものを直接記述すること。',
    fields: {
      url: '動画URL',
      title: 'タイトル',
      channel: 'チャンネル',
      description: '説明文（参考）',
      chapters: 'チャプター情報',
    },
    headings: {
      overview: '概要',
      chapters: 'チャプター',
      keyPoints: '主なポイント',
      details: '詳細',
      conclusion: 'まとめ',
    },
  },
  en: {
    menuLabel: 'English',
    promptName: 'English',
    unknown: 'Unknown',
    style:
      'Write in a plain declarative register and assert the content as fact ("X is the case"). ' +
      'Never frame it — no "this video explains...", "the creator introduces...", "we learn that...".',
    fields: {
      url: 'Video URL',
      title: 'Title',
      channel: 'Channel',
      description: 'Description (for reference)',
      chapters: 'Chapters',
    },
    headings: {
      overview: 'Overview',
      chapters: 'Chapters',
      keyPoints: 'Key points',
      details: 'Details',
      conclusion: 'Conclusion',
    },
  },
  es: {
    menuLabel: 'Español',
    promptName: 'Spanish (español)',
    unknown: 'Desconocido',
    style:
      'Escribe en registro declarativo directo y afirma el contenido como un hecho («X es así»). ' +
      'Nunca lo enmarques: nada de «este vídeo explica...», «el creador presenta...», «se nos cuenta que...».',
    fields: {
      url: 'URL del vídeo',
      title: 'Título',
      channel: 'Canal',
      description: 'Descripción (referencia)',
      chapters: 'Capítulos',
    },
    headings: {
      overview: 'Resumen general',
      chapters: 'Capítulos',
      keyPoints: 'Puntos clave',
      details: 'Detalles',
      conclusion: 'Conclusión',
    },
  },
};

/** Picker options, in the order the languages are declared above. */
export const SUMMARY_LANGUAGE_OPTIONS = SUMMARY_LANGUAGES.map((code) => ({
  code,
  label: LANGUAGES[code].menuLabel,
}));

const SUMMARY_LANGUAGE_STORAGE_KEY = 'tuberefine:summary-language';

/**
 * The preference lives in localStorage rather than the database: it only
 * decides the language of the *next* generation, so it never has to be readable
 * from the server or from another device.
 */
export function readSummaryLanguage(): SummaryLanguage {
  try {
    const stored = window.localStorage.getItem(SUMMARY_LANGUAGE_STORAGE_KEY);
    return isSummaryLanguage(stored) ? stored : DEFAULT_SUMMARY_LANGUAGE;
  } catch {
    return DEFAULT_SUMMARY_LANGUAGE;
  }
}

export function writeSummaryLanguage(lang: SummaryLanguage): void {
  try {
    window.localStorage.setItem(SUMMARY_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Private mode / storage disabled — generation still works, at the default.
  }
}

export type VideoSummaryInput = {
  url: string;
  title: string | null;
  channel_name: string | null;
  description: string | null;
};

/** Chapter lines in a description look like "0:00 Title" or "1:23:45 Title". */
export function extractChapters(description: string): { time: string; title: string }[] | null {
  const tsRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;
  const chapters = description.split('\n').flatMap((line) => {
    const m = line.trim().match(tsRegex);
    return m ? [{ time: m[1], title: m[2].trim() }] : [];
  });
  return chapters.length >= 2 ? chapters : null;
}

export function buildVideoSummaryPrompt(
  bookmark: VideoSummaryInput,
  lang: SummaryLanguage = DEFAULT_SUMMARY_LANGUAGE
): string {
  const L = LANGUAGES[lang];
  const chapters = extractChapters(bookmark.description || '');

  const descriptionContext = bookmark.description
    ? `\n${L.fields.description}:\n${bookmark.description.slice(0, 2000)}`
    : '';

  const chapterSection = chapters
    ? `\n\n[${L.fields.chapters} — use these exact timestamps]\n${chapters.map((c) => `(${c.time}) ${c.title}`).join('\n')}`
    : '';

  const chapterPromptBlock = chapters
    ? `## ${L.headings.chapters}
Cover every chapter in this form, with the timestamp at the end of the heading:
### <the chapter's own title> (00:00)
Write 3-5 sentences centred on what the creator argues or concludes in that section.
Always include the concrete figures, examples, proper nouns and data, in **bold**.
${L.style}`
    : `## ${L.headings.keyPoints}
- List the points as bullets (6-10 of them)
- Each bullet states the creator's claim or conclusion in one sentence (no announcing or teasing register)
- Put the important proper nouns, figures and data in **bold**

## ${L.headings.details}
Expand on each point in 3-5 sentences.
- What the creator bases the claim on
- Always include concrete figures, examples, comparisons and experimental results where they exist
- ${L.style}`;

  return `Watch the YouTube video below and write a detailed summary of it.

${L.fields.url}: ${bookmark.url}
${L.fields.title}: ${bookmark.title || L.unknown}
${L.fields.channel}: ${bookmark.channel_name || L.unknown}${descriptionContext}${chapterSection}

[CORE RULES]
- Write the entire summary in ${L.promptName}. Headings, body text and labels must all be in ${L.promptName}, whatever language the video and its description are in.
- Open the video URL and analyse the video itself, not just the title and description.
- Never hold anything back to "encourage viewing" or to avoid spoilers. State the video's conclusions, claims and data in full.
- Be detailed enough that someone who reads the summary understands the video completely without watching it.
- Never write a preamble or an acknowledgement ("Sure", "Here is the summary"). Output only the Markdown described below.
- ${L.style}
- ${chapters ? 'Reuse the timestamps from the chapter list above verbatim, appended to the heading as (MM:SS).' : 'Do not write timestamps at all.'}

[OUTPUT FORMAT — the headings below are already written in ${L.promptName}; reproduce them exactly as given]

## ${L.headings.overview}
Explain the video's central argument, conclusion and theme in 4-5 sentences.
Include the background, the problem it raises and the creator's position.
${L.style}

${chapterPromptBlock}

## ${L.headings.conclusion}
State the creator's final conclusion, claim or recommendation in 3-5 sentences.
${L.style}`;
}

/** Throws on a transport error or an empty completion. */
export async function generateVideoSummary(
  bookmark: VideoSummaryInput,
  apiKey: string,
  lang: SummaryLanguage = DEFAULT_SUMMARY_LANGUAGE
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      messages: [{ role: 'user', content: buildVideoSummaryPrompt(bookmark, lang) }],
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

  return summary;
}
