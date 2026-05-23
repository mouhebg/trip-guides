import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, "Content-Type": "application/json"},
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "generated-trip";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});
  if (req.method !== "POST") return json({error: "Method not allowed"}, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  const authHeader = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) return json({error: "Missing Supabase function env"}, 500);
  if (!deepseekKey) return json({error: "Missing DEEPSEEK_API_KEY"}, 500);
  if (!authHeader) return json({error: "Sign in required"}, 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {headers: {Authorization: authHeader}},
  });
  const {data: userData, error: userError} = await supabase.auth.getUser();
  if (userError || !userData.user) return json({error: "Sign in required"}, 401);

  const input = await req.json().catch(() => ({}));
  const destination = String(input.destination || "").trim();
  const start = String(input.start || "").trim();
  const notes = String(input.notes || "").trim();
  if (!destination) return json({error: "Destination is required"}, 400);

  const system = `You create personal day-trip guides as JSON only.
Return a JSON object with this exact shape:
{
  "title": "string",
  "location": "string",
  "summary": "one sentence",
  "trip_type": "Day trip",
  "distance": "short text",
  "duration": "short text",
  "season": "short text",
  "getting_there": "paragraph",
  "sections": [
    {"heading": "string", "items": [{"title": "string", "body": "paragraph"}]}
  ],
  "itinerary": [{"time": "9:00 AM", "title": "string", "description": "sentence"}],
  "tips": ["string"]
}
Use the tone and structure of a calm, practical family trip guide.
Prefer accessible pacing, realistic timings, rest breaks, food notes, and mobile-friendly directions.
Do not include markdown.`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {role: "system", content: system},
        {role: "user", content: JSON.stringify({destination, start, notes})},
      ],
      response_format: {type: "json_object"},
      thinking: {type: "disabled"},
      stream: false,
      temperature: 0.45,
      max_tokens: 3500,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return json({error: "DeepSeek request failed", detail}, 502);
  }

  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content || "{}";
  let guide;
  try {
    guide = JSON.parse(content);
  } catch (_error) {
    return json({error: "DeepSeek returned invalid JSON"}, 502);
  }

  const baseSlug = slugify(guide.title || destination);
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const {data: trip, error} = await supabase
    .from("user_trips")
    .insert({
      user_id: userData.user.id,
      slug,
      title: guide.title || destination,
      destination,
      source: "ai",
      saved: true,
      visited: false,
      guide_data: guide,
    })
    .select()
    .single();

  if (error) return json({error: error.message}, 500);
  return json({trip});
});
