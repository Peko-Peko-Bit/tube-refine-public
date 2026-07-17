import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function isServiceRole(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const payloadB64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadB64));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  let bookmarkId: string | null = null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  const GOOGLE_TRANSLATE_API_KEY = Deno.env.get("GOOGLE_TRANSLATE_API_KEY") ?? "";

  // Only accept calls from our own server (service role). The payload's
  // record.id is trusted below, so user-originated calls must be rejected.
  // The platform gateway (verify_jwt) has already checked the signature,
  // so the role claim in the token payload can be trusted here.
  if (!isServiceRole(req.headers.get("Authorization") ?? "")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    const description: string = payload.description || "";
    const title: string = record.title || "";
    const existingTags: string[] = [
      ...(record.tags || []),
      ...(record.user_tags || []),
    ];
    bookmarkId = record.id;

    if (!bookmarkId) {
      return new Response(JSON.stringify({ error: "Missing bookmark ID" }), { status: 400 });
    }

    const truncatedDescription = description.slice(0, 3000);

    const prompt = `You are a YouTube video metadata extractor. Analyze the title and description below.

Title: ${title}
Description: ${truncatedDescription}

Return ONLY valid JSON with this structure:
{
  "summary": "（日本語で約300字の要約）",
  "tags_ai": ["tag1", "tag2", ...]
}

Rules:
- summary: Japanese, professional, concise, approx 300 characters.
- tags_ai: Generate 5-10 tags in the SAME LANGUAGE as the video title/description.
  * FIRST priority — proper nouns: product names, brand names, game/software/app titles, company names, person names, technology names (e.g. "Nintendo Switch", "GPT-4", "Gemma 3", "Claude")
  * SECOND priority — specific technical concepts, methods, or domain terminology unique to this video
  * AVOID generic words: "tutorial", "guide", "review", "video", "tips", "introduction", "how to", "解説", "入門"
  * DO NOT duplicate concepts already in: [${existingTags.join(", ")}]
  * Keep each tag to 1-4 words; use natural casing for proper nouns
- Return ONLY JSON. No markdown.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemma-3-12b-it",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter API error: ${res.statusText} - ${text}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content?.trim() || "";

    let parsed;
    try {
      const cleanJson = content.replace(/^```json\n?|\n?```$/g, "");
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      throw new Error("Failed to parse AI JSON response");
    }

    const generatedTags: string[] = parsed.tags_ai || [];

    // Translate tags_ai to English (parallel to tags_en for YouTube tags)
    let tags_ai_en: string[] | null = null;
    if (GOOGLE_TRANSLATE_API_KEY && generatedTags.length > 0) {
      try {
        const translateRes = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: generatedTags, target: "en", format: "text" }),
          }
        );
        if (translateRes.ok) {
          const tData = await translateRes.json();
          tags_ai_en = tData.data?.translations?.map((t: any) =>
            t.translatedText.toLowerCase().trim()
          ) || null;
        }
      } catch (e) {
        console.error("[ai-tagging] Translation failed:", e);
      }
    }

    const { error: updateError } = await supabase
      .from("bookmarks")
      .update({
        description_summary: parsed.summary || null,
        tags_ai: generatedTags,
        tags_ai_en,
        ai_status: "done"
      })
      .eq("id", bookmarkId);

    if (updateError) {
      throw new Error(`Failed to update bookmark: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ success: true, bookmarkId }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ai-tagging] Error:`, error.message);

    if (bookmarkId) {
      await supabase
        .from("bookmarks")
        .update({ ai_status: "failed" })
        .eq("id", bookmarkId);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
