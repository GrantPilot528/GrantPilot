// Grant Pilot — configuration
// Fill these in from Supabase → Project Settings → API.
// These two values are safe to publish: the anon key only grants what your
// row-level security policies allow. Your Anthropic API key does NOT go here —
// it lives as an environment variable on Netlify. See README.md.

window.GP_CONFIG = {
  SUPABASE_URL: "https://vtgsmecuckocndqxffsd.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0Z3NtZWN1Y2tvY25kcXhmZnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMzA3ODUsImV4cCI6MjEwMzYwNjc4NX0.u15FW8JloowzzaZC4eZL3RnTLNpzSot8bCiQe57EfLA",

  // Set to false if you have not deployed the /api/suggest function yet.
  // The app still works — you just rank opportunities by hand instead.
  AI_SUGGESTIONS_ENABLED: true,
};
