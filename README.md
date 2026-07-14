# Mombasa Open Tong-Il Moo-Do Scoring System

Live tournament scoring for 2 concurrent courts with real-time public scoreboards.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Realtime + Auth) · Vercel

## Features

- **2 independent courts** (A and B) with strict court isolation enforced by Postgres RLS
- **Touch-optimised scorer tablets** at `/court/1` and `/court/2` (4-digit PIN)
- **Public scoreboard** at `/scoreboard` (split view) and `/scoreboard/[court]` (TV mode), no login
- **Admin dashboard** at `/admin` (6-digit PIN): live status, score override, match assignment, athlete CRUD
- **Real-time sync** via Supabase Realtime channels (`matches:court:1`, `matches:court:2`)
- **Offline queue** on tablets (Zustand + localStorage) with automatic replay on reconnect
- Undo (20 actions), lock screen, foul tracking with disqualification at 3 fouls, win-method dialogs

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the entire contents of `supabase/schema.sql`. This creates all tables, RLS policies, realtime publications, and demo seed data (1 tournament, 16 athletes, 8 matches).
3. Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**.
4. Create the demo users (auth users + PIN hashes):

   ```bash
   npm install
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users
   ```

### 2. Demo PINs

| Role | PIN | Access |
| --- | --- | --- |
| Admin | `123456` | `/admin`, score override on both courts |
| Court A Scorer | `1111` | `/court/1` only |
| Court B Scorer | `2222` | `/court/2` only |

### 3. Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000 and use the links on the landing page.

### 4. Deploy to Vercel

1. Push this repository to GitLab (already done) and import it in [Vercel](https://vercel.com/new) (Vercel supports GitLab repos natively).
2. Set the three environment variables from `.env.example` in **Project → Settings → Environment Variables**. Mark `SUPABASE_SERVICE_ROLE_KEY` as *server only* (never expose it with the `NEXT_PUBLIC_` prefix).
3. Deploy. No further configuration is required.

## Routes

| Route | Purpose | Auth |
| --- | --- | --- |
| `/` | Landing page with links | none |
| `/scoreboard` | Both courts, live | none |
| `/scoreboard/1`, `/scoreboard/2` | Single-court TV display | none |
| `/court/1`, `/court/2` | Scorer tablet interface | scorer PIN (court-matched) |
| `/admin` | Dashboard, override, assignment | admin PIN |
| `/admin/athletes` | Athlete registration CRUD | admin PIN |

## Security notes

- The `users` table (PIN hashes) is **not** publicly readable; PIN validation runs server-side in `/api/auth/login` with the service role key.
- RLS policies use `security definer` helper functions (`is_admin`, `can_score_court`) so scorers can only write to matches on their own court, enforced at the database layer.
- Public tables (`tournaments`, `events`, `athletes`, `matches`, `score_events`) are read-only for anonymous visitors.
