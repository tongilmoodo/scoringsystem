import { NextResponse } from 'next/server';

const LANG_NAMES: Record<string, string> = {
  sw: 'Swahili',
  fr: 'French',
  es: 'Spanish',
};

// Translates UI labels with Gemini. Fails soft (empty result) when the API
// key is missing so the UI falls back to English / static dictionaries.
export async function POST(req: Request) {
  const { texts, lang } = await req.json().catch(() => ({ texts: null, lang: null }));
  if (!Array.isArray(texts) || texts.length === 0 || !LANG_NAMES[lang]) {
    return NextResponse.json({ translations: {} });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ translations: {} });

  const prompt = `Translate the following UI labels from English to ${LANG_NAMES[lang]} for a martial arts tournament scoring app. Keep them short. Return ONLY a JSON object mapping each original English string to its translation.\n\n${JSON.stringify(texts.slice(0, 50))}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) throw new Error('gemini error');
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return NextResponse.json({ translations: JSON.parse(text) });
  } catch {
    return NextResponse.json({ translations: {} });
  }
}
