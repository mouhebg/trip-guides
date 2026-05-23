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

function asString(value: unknown, fallback = "") {
  return String(value || "").replace(/\s+/g, " ").trim() || fallback;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeGuide(raw: any, destination: string, start: string, notes: string) {
  const title = asString(raw?.title, `${destination} Guide`);
  const location = asString(raw?.location, destination);
  const summary = asString(raw?.summary, `A practical day-trip guide for ${destination}.`);
  const intro = asString(raw?.intro, summary);
  const tags = asArray(raw?.tags).map((tag) => asString(tag)).filter(Boolean).slice(0, 5);
  if (!tags.length) tags.push("AI", "Saved");

  const sectionFallbacks = [
    {
      heading: "What to see",
      items: [
        {title: "Main visit plan", body: summary},
        {title: "Best first stop", body: `Start with the easiest orientation point at ${destination}, then build the rest of the visit around the highest-priority sights.`},
      ],
    },
    {
      heading: "Pacing the day",
      items: [
        {title: "Keep the route relaxed", body: "Leave buffer time between stops so the day still works if parking, tickets, weather, or food take longer than expected."},
        {title: "Plan a real break", body: "Add a seated lunch or snack break near the middle of the visit, especially for family or accessibility needs."},
      ],
    },
    {
      heading: "Practical details",
      items: [
        {title: "Before leaving", body: "Check hours, ticket rules, parking, washrooms, weather, and any seasonal closures before you go."},
        {title: "What to bring", body: "Bring water, snacks, comfortable shoes, weather layers, a phone charger, and any mobility supports needed for the group."},
      ],
    },
  ];

  const sections = asArray(raw?.sections)
    .map((section) => ({
      heading: asString(section?.heading, "Trip details"),
      items: asArray(section?.items)
        .map((item) => ({
          title: asString(item?.title, "Stop"),
          body: asString(item?.body || item?.description),
        }))
        .filter((item) => item.title || item.body)
        .slice(0, 4),
    }))
    .filter((section) => section.heading && section.items.length)
    .slice(0, 4);

  while (sections.length < 3) sections.push(sectionFallbacks[sections.length]);

  const itinerary = asArray(raw?.itinerary)
    .map((stop) => ({
      time: asString(stop?.time, "TBD"),
      title: asString(stop?.title, "Stop"),
      duration: asString(stop?.duration),
      description: asString(stop?.description || stop?.body, "Keep this stop relaxed and adjust based on the group."),
    }))
    .filter((stop) => stop.title || stop.description)
    .slice(0, 9);

  if (itinerary.length < 4) {
    itinerary.push(
      {time: start ? "Depart" : "Morning", title: start ? `Leave ${start}` : "Start the day", duration: "", description: "Leave with enough buffer for parking, tickets, and orientation."},
      {time: "Late morning", title: "Main visit block", duration: "90 min", description: "Do the highest-priority stop while energy is fresh."},
      {time: "Midday", title: "Lunch or rest break", duration: "45 min", description: "Sit down, eat, use washrooms, and reset the pace."},
      {time: "Afternoon", title: "Second visit block", duration: "60 min", description: "Pick one or two lower-pressure stops before heading home."},
    );
  }

  const route = asArray(raw?.route)
    .map((step) => ({
      time: asString(step?.time),
      label: asString(step?.label || step?.title),
      detail: asString(step?.detail || step?.description),
    }))
    .filter((step) => step.time || step.label || step.detail)
    .slice(0, 4);

  const tips = asArray(raw?.tips)
    .map((tip) => typeof tip === "string" ? asString(tip) : asString(tip?.text || tip?.title))
    .filter(Boolean)
    .slice(0, 8);

  while (tips.length < 4) {
    tips.push(
      "Check the official website for current hours, tickets, closures, and seasonal notes before leaving.",
      "Keep water, snacks, layers, and a phone charger handy.",
      "Leave buffer time so the guide still works if one stop takes longer than expected.",
      notes ? `Keep this trip note in mind: ${notes}` : "Prioritize comfort over completing every stop.",
    );
  }

  return {
    title,
    location,
    summary,
    intro,
    trip_type: asString(raw?.trip_type, "Day trip"),
    distance: asString(raw?.distance, start ? `From ${start}` : ""),
    duration: asString(raw?.duration, "Day guide"),
    season: asString(raw?.season, "Check season"),
    tags,
    getting_there: asString(raw?.getting_there, start ? `Plan the route from ${start} to ${destination}, leaving buffer time for traffic, parking, tickets, and washrooms.` : `Plan your route to ${destination}, leaving buffer time for traffic, parking, tickets, and washrooms.`),
    route,
    sections,
    itinerary,
    tips,
  };
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
Return one complete JSON object with this exact shape:
{
  "title": "string",
  "location": "string",
  "summary": "one sentence",
  "intro": "short introductory paragraph",
  "trip_type": "Day trip",
  "distance": "short text such as 120 km from Ottawa",
  "duration": "short text",
  "season": "short text",
  "tags": ["3 to 5 short labels"],
  "getting_there": "paragraph",
  "route": [
    {"time": "9:00 AM", "label": "Leave", "detail": "short text"},
    {"time": "10:20 AM", "label": "Arrive", "detail": "short text"},
    {"time": "3:30 PM", "label": "Head home", "detail": "short text"},
    {"time": "5:00 PM", "label": "Back", "detail": "short text"}
  ],
  "sections": [
    {"heading": "The main experience", "items": [{"title": "string", "body": "paragraph"}]},
    {"heading": "Food, breaks, and pacing", "items": [{"title": "string", "body": "paragraph"}]},
    {"heading": "Accessibility and practical notes", "items": [{"title": "string", "body": "paragraph"}]}
  ],
  "itinerary": [{"time": "9:00 AM", "title": "string", "duration": "30 min", "description": "sentence"}],
  "tips": ["at least four practical strings"]
}
Use the tone and structure of a calm, practical family trip guide.
Prefer accessible pacing, realistic timings, rest breaks, food notes, and mobile-friendly directions.
Include exactly 3 main sections before the itinerary, 2 to 4 items in each section, 6 to 8 itinerary stops, and at least 4 tips.
Do not include markdown.`;

  const deepseekController = new AbortController();
  const deepseekTimer = setTimeout(() => deepseekController.abort(), 75000);
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
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
      signal: deepseekController.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json({error: "DeepSeek timed out. Try again with shorter notes."}, 504);
    }
    return json({error: "DeepSeek request failed", detail: String(error)}, 502);
  } finally {
    clearTimeout(deepseekTimer);
  }

  if (!response.ok) {
    const detail = await response.text();
    return json({error: "DeepSeek request failed", detail}, 502);
  }

  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content || "{}";
  let parsedGuide;
  try {
    parsedGuide = JSON.parse(content);
  } catch (_error) {
    return json({error: "DeepSeek returned invalid JSON"}, 502);
  }

  const guide = normalizeGuide(parsedGuide, destination, start, notes);
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
