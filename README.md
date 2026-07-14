# Mombasa Open Tong-Il Moo-Do Scoring System

Live tournament scoring for 2 concurrent courts with real-time public scoreboards, bracket management, AI voice scoring, and multi-language support.

**Stack:** Next.js 14 (App Router) - TypeScript - Tailwind CSS - Supabase (PostgreSQL + Realtime + Auth) - Google Gemini - Vercel

## Features

- **2 independent courts** (A and B) with strict court isolation enforced by Postgres RLS
- **Touch-optimised scorer tablets** at `/court/1` and `/court/2` (4-digit PIN)
- **Public scoreboard** at `/scoreboard` (split view) and `/scoreboard/[court]` (TV mode), no login
- **Public bracket** at `/bracket` with live colour-coded status (gray = scheduled, green = live, blue = completed)
- **Admin dashboard** at `/admin` (6-digit PIN): live status, score override, match assignment
- **Draw & bracket generation** at `/admin/draw`: random lots, byes to highest seeds, single elimination, publish/re-draw
- **Match management** at `/admin/matches`: filters, court assignment, match reset, printable official match sheets
- **Results & reports** at `/admin/results`: medal table by country, completed results, PDF (print) and Excel (CSV) export
- **Bulk CSV athlete import** with preview at `/admin/athletes`
- **Database-driven scoring**: triggers derive match scores from the `score_events` audit trail and auto-advance winners through the bracket
- **Real-time sync** via Supabase Realtime channels (`matches:court:1`, `matches:court:2`)
- **Offline queue** on tablets (Zustand + localStorage) with automatic replay on reconnect
- **Voice scoring (Gemini AI)**: referee says \"Blue plus three spinning kick\" or \"Red foul\"; >90% confidence auto-executes, otherwise a confirmation dialog shows the transcript. Manual buttons always available.
- **Multi-language UI**: detects `navigator.language`; English, Swahili, French, Spanish. Static dictionaries for common labels, Gemini translates the rest (cached in localStorage). Public scoreboard auto-translates per viewer.
- **Keyboard shortcuts** for scorers (see below)
- **Sound effects**: buzzer at time-up, chime on score, warning beep on foul (Web Audio, no assets)
- Undo (20 actions), lock screen, disqualification at 3 fouls, win-method dialogs

## Keyboard shortcuts (scorer tablets with keyboards)

| Key | Action |
| --- | --- |
| `Space` | Start / Pause timer |
| `1` / `Shift+1` | Blue +1 / Red +1 |
| `2` / `Shift+2` | Blue +2 / Red +2 |
| `3` / `Shift+3` | Blue +3 / Red +3 |
| `F` / `Shift+F` | Blue Foul / Red Foul |
| `U` | Undo |
| `L` | Lock screen |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the entire contents of `supabase/schema.sql` (schema v1.0: tables, triggers, RLS, realtime, demo tournament with 16 athletes).
3. Copy `.env.example` to `.env.local` and fill in all values.
4. Create the login users (auth users + bcrypt PIN hashes):

   ```bash
   npm install
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users
   ```
5. Optional: create a public Storage bucket `athlete-photos` for athlete photos (`photo_url`).

### 2. Google Gemini (optional but recommended)

1. Create an API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Set `GEMINI_API_KEY` in `.env.local` (and in Vercel for production).
3. Without the key, voice scoring is disabled and translations fall back to the built-in dictionaries. Everything else works.

### 3. Demo PINs

| Role | PIN | Access |
| --- | --- | --- |
| Admin (Tournament Director) | `800811` | All `/admin` pages, override on both courts |
| Court A Scorer | `8118111` | `/court/1` only |
| Court B Scorer | `822822` | `/court/2` only |

### 4. Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000, generate a bracket at `/admin/draw`, assign matches to courts, then score from `/court/1` and `/court/2`.

### 5. Deploy to Vercel

1. Import this GitLab repository in [Vercel](https://vercel.com/new).
2. Set all environment variables from `.env.example` in **Project > Settings > Environment Variables**. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are server-only; never prefix them with `NEXT_PUBLIC_`.
3. Deploy. No further configuration is required.

## Routes

| Route | Purpose | Auth |
| --- | --- | --- |
| `/` | Landing page with links | none |
| `/scoreboard` | Both courts, live, auto-translated | none |
| `/scoreboard/1`, `/scoreboard/2` | Single-court TV display | none |
| `/bracket` | Live public bracket | none |
| `/court/1`, `/court/2` | Scorer tablet (voice, shortcuts, sounds) | scorer PIN (court-matched) |
| `/admin` | Dashboard, override, assignment | admin PIN |
| `/admin/draw` | Draw generation and bracket publishing | admin PIN |
| `/admin/matches` | Match table, filters, reset, print sheets | admin PIN |
| `/admin/results` | Medal table, results, PDF/Excel export | admin PIN |
| `/admin/athletes` | Athlete CRUD + bulk CSV import | admin PIN |

## Tournament-day checklist

**The week before**
- [ ] Supabase project live, schema applied, users seeded
- [ ] Production deploy on Vercel verified (all env vars set, including `GEMINI_API_KEY`)
- [ ] All athletes registered or CSV-imported in `/admin/athletes`
- [ ] Draw generated and published in `/admin/draw`; bracket verified at `/bracket`
- [ ] Blank match sheets printed from `/admin/matches` as paper backup

**The night before**
- [ ] Charge both scorer tablets + spares; disable OS auto-lock and notifications
- [ ] Test PIN login on each tablet (`1111` on the Court A device only, `2222` on Court B only)
- [ ] Test voice scoring in the actual hall (microphone permissions, background noise)
- [ ] Verify TVs load `/scoreboard/1` and `/scoreboard/2` full-screen
- [ ] Confirm venue Wi-Fi and a mobile hotspot fallback

**Morning of the tournament**
- [ ] Open `/admin` and assign the first match to each court
- [ ] Dry-run one full match per court: score, foul, undo, lock, timer, end match
- [ ] Confirm the winner auto-advanced in the bracket and scores hit the public scoreboard within a second
- [ ] Brief scorers on keyboard shortcuts and the offline indicator

**During the event**
- [ ] Watch the Offline indicator on tablets; queued actions sync automatically on reconnect
- [ ] Use admin override for scoring disputes; reset a match from `/admin/matches` if needed
- [ ] Print completed match sheets per round for official records

**After the event**
- [ ] Export results (PDF + Excel) from `/admin/results`
- [ ] Set tournament status to `completed`
- [ ] Rotate all PINs and the Supabase service role key

## Security notes

- The `users` table (PIN hashes) is **not** publicly readable; PIN validation runs server-side in `/api/auth/login` with the service role key.
- RLS policies use `SECURITY DEFINER` helper functions (`is_admin`, `can_score_court`) so scorers can only write to matches on their own court, enforced at the database layer.
- Scores are derived server-side by triggers from the `score_events` audit trail; clients never write score totals directly.
- Gemini calls run server-side only (`/api/voice`, `/api/translate`); the API key is never shipped to the browser.
