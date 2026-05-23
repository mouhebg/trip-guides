# trip-guides
Personal trip guides published as static HTML.

## Supabase

Project: `trip-guides`

Public URL: `https://hkosestllbzvwqzxgkvk.supabase.co`

The browser app uses Supabase email magic-link auth and the `public.user_trips` table. The table schema and row-level security policies live in `supabase/schema.sql`.

## AI trip generation

The frontend calls the `generate-trip` Edge Function. The function source lives in `supabase/functions/generate-trip/index.ts`.

The function is deployed to project `hkosestllbzvwqzxgkvk` and uses the Supabase secret `DEEPSEEK_API_KEY`.

Generated guides and uploaded HTML guides are stored in `user_trips.guide_data` and rendered through `generated/index.html`.
