# Tong-Il Moo-Do Scoring System

Multi-tournament live scoring platform for Tong-Il Moo-Do events: 2 concurrent courts per tournament, 4-judge consensus scoring, real-time public scoreboards, bracket management, AI voice scoring, and multi-language support. Any number of tournaments can run on one deployment, each addressed by its URL slug (`/t/[slug]/...`) with tournament-scoped PINs.

**Stack:** Next.js 14 (App Router) - TypeScript - Tailwind CSS - Supabase (PostgreSQL + Realtime + Auth) - Google Gemini - Vercel

## Features

- **2 independent courts** (A and B) with strict court isolation enforced by Postgres RLS
- **4-judge consensus scoring**: each court has 4 corner judges at `/judge/[court]`; a score only commits when 3+ judges vote for the same action (enforced by the `cast_vote` database function)
- **Court controllers** at `/controller/[court]`: timer control, live vote monitor, clear votes, manual score override, undo, lock judges, declare winner
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
- **Standard country list + flags**: `i18n-iso-countries` is the single source of truth; searchable country picker on athlete registration; self-hosted SVG flags (`country-flag-icons`, copied to `public/flags` on install) on scoreboards/TVs with emoji fallback in compact rows; CSV import validates countries by name or code
- Undo (20 actions), lock screen, disqualification at 3 fouls, win-method dialogs

## Keyboard shortcuts (controller tablets with keyboards; 1/2/3/F commit as manual override)

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
| Court A Controller | `8118111` | `/controller/1` only |
| Court A Judges 1-4 | `8118112`, `8118113`, `8118114`, `8118115` | `/judge/1` only |
| Court B Controller | `822822` | `/controller/2` only |
| Court B Judges 1-4 | `8228221`, `8228222`, `8228223`, `8228224` | `/judge/2` only |

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
| `/` | Tournament directory with links | none |
| `/t/[slug]/scoreboard` | All courts, live, auto-translated | none |
| `/t/[slug]/scoreboard/1`, `.../2` | Single-court TV display | none |
| `/t/[slug]/bracket` | Live public bracket | none |
| `/t/[slug]/judge/1`, `.../2` | Corner judge voting tablet (point values only) | judge PIN (tournament + court) |
| `/t/[slug]/controller/1`, `.../2` | Controller: timer, rounds/breaks, takedown, vote monitor, overrides | controller PIN (tournament + court) |
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
- [ ] Test PIN login on every device: controller + 4 judge tablets per court (see PIN table)
- [ ] Dry-run consensus: have 3 judges vote the same score and confirm it commits and flashes green
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
