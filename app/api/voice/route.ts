import { NextResponse } from 'next/server';

const PROMPT = `You are a scoring assistant for a Tong-Il Moo-Do martial arts tournament.
Listen to the referee's spoken command and extract the scoring intent.

Rules:
- "blue" or "red" identifies the athlete side.
- "plus one" / "one" / "punch" means action point_1.
- "plus two" / "two" / "kick" means action point_2.
- "plus three" / "three" / "spin kick" / "spinning kick" means action point_3.
- "foul" / "warning" / "penalty" means action foul.

Return ONLY JSON with this exact shape:
{"side": "blue" | "red", "action": "point_1" | "point_2" | "point_3" | "foul", "confidence": <number 0..1>, "transcript": "<what was said>"}
If you cannot determine side or action, set confidence to 0.`;

export async function POST(req: Request) {
  const { audio, mimeType } = await req.json().catch(() => ({ audio: null, mimeType: null }));
  if (typeof audio !== 'string' || audio.length === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType: mimeType || 'audio/webm', data: audio } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      }
    );
    if (!res.ok) throw new Error('gemini error');
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text);
    if (
      !['blue', 'red'].includes(parsed.side) ||
      !['point_1', 'point_2', 'point_3', 'foul'].includes(parsed.action)
    ) {
      return NextResponse.json({ error: 'Could not parse intent' }, { status: 422 });
    }
    return NextResponse.json({
      side: parsed.side,
      action: parsed.action,
      confidence: Number(parsed.confidence) || 0,
      transcript: String(parsed.transcript ?? ''),
    });
  } catch {
    return NextResponse.json({ error: 'Voice processing failed' }, { status: 500 });
  }
}
