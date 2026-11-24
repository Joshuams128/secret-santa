# Secret Santa 🎅

Share one link; everyone joins with a name, wish list, notes and a meet-up date (Dec 4, 11 or 13). The organizer draws names and each person reveals their match with a personal code.

**Stack:** static page in `public/`, serverless API in `api/` + `lib/handler.js`, data in Supabase (`ss_settings`, `ss_participants`; schema in `supabase/migrations/`).

## Deploy on Vercel
1. Import this repo in Vercel (no build settings needed).
2. Add environment variables (see `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` — the *secret* key from Supabase › Project Settings › API Keys. Server-only; never put it in `public/`.
   - `ADMIN_PIN` — your organizer PIN.
3. Deploy and share the URL.

The tables have row-level security on with no public policies, so the database can only be reached through the API.

Edit the meet-up dates in `DATES` in `lib/handler.js`. Run `npm test` for the handler tests; use `vercel dev` for local runs.
