# trip-guides
Personal trip guides published as static HTML.

## Supabase

Project: `trip-guides`

Public URL: `https://hkosestllbzvwqzxgkvk.supabase.co`

The browser app uses Supabase email magic-link auth and the `public.user_trips` table. The table schema and row-level security policies live in `supabase/schema.sql`.

## AI trip generation

The frontend calls the `generate-trip` Edge Function. The function source lives in `supabase/functions/generate-trip/index.ts`.

Before AI generation works online:

1. Set the Supabase secret `DEEPSEEK_API_KEY`.
2. Deploy the `generate-trip` Edge Function to project `hkosestllbzvwqzxgkvk`.
