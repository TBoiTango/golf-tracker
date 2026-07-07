# TR Golf Tracker — Setup Guide

## 1. Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project (e.g. `tr-golf-tracker`)
2. Once provisioned, go to **SQL Editor** and paste + run the contents of `supabase/schema.sql`
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SETUP_PASSWORD=golf2026
```

> Change `golf2026` to whatever setup password you want.

## 3. GitHub

```bash
cd "Golf Tracker"
git init
git add .
git commit -m "Initial commit"
gh repo create TBoiTango/tr-golf-tracker --public --push --source=.
```

## 4. Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import from GitHub → select `tr-golf-tracker`
2. Add the three environment variables from step 2
3. Deploy

## 5. Day-Of Flow

1. Open `https://your-app.vercel.app/setup`
2. Enter the setup password
3. Click **Initialize July 11 Round** (creates the round + all 12 players in DB)
4. For each player: set handicap, assign to Group 1/2/3, assign Vegas Team 1 or 2
5. Click **Start Round (Go Live)**
6. Share each player's **Score link** — they bookmark it and enter their own scores
7. Everyone watches live at the root URL `/`
8. Each foursome's Vegas tracker is at `/foursome/[id]`
