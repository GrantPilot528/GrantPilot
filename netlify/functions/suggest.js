/**
 * Grant Pilot — /api/suggest
 *
 * Returns opportunities the organization does not have yet, plus a ranking.
 *
 *   1. Pulls REAL open opportunities from the public Grants.gov search API using
 *      the writer's focus areas and the organization's mission as keywords. This
 *      runs server-side because Grants.gov sends no CORS headers, so a browser
 *      cannot call it directly.
 *   2. Asks Claude to rank the combined pool (newly found + already saved)
 *      against this organization's real profile, and to explain each pick.
 *
 * The model never invents opportunities. It only reorders and annotates a list it
 * was handed, and the client checks every returned id against that list. A grant
 * that does not exist cannot reach a user.
 */

const GRANTS_API = "https://api.grants.gov/v1/api/search2";
const MODEL = "claude-sonnet-4-6";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Bad JSON" }); }

  const { org = {}, person = {}, pool = [], known_ids = [] } = body;

  // ---------------- 1. find real opportunities ----------------
  const queries = buildQueries(org, person);
  const seen = new Set(known_ids);
  const found = [];

  for (const q of queries) {
    let hits = [];
    try { hits = await searchGrantsGov(q); }
    catch (e) { console.error("grants.gov '" + q + "':", e.message); continue; }
    for (const h of hits) {
      if (seen.has(h.external_id)) continue;
      seen.add(h.external_id);
      found.push(h);
    }
    if (found.length >= 40) break;
  }

  const candidates = [
    ...pool.map(o => ({ ...o, ref: o.id, origin: "saved" })),
    ...found.map(o => ({ ...o, ref: o.external_id, origin: "grants.gov" })),
  ];

  if (candidates.length === 0) {
    return json(200, { picks: [], found: [], note: "No open opportunities matched those focus areas." });
  }

  // ---------------- 2. rank ----------------
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let picks = null;

  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1600,
          messages: [{ role: "user", content: buildPrompt(org, person, candidates) }],
        }),
      });
      if (!res.ok) throw new Error("Anthropic API " + res.status);
      const data = await res.json();
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      picks = JSON.parse(text.replace(/```json|```/g, "").trim()).picks || [];
    } catch (e) {
      console.error("ranking failed:", e.message);
      picks = null;
    }
  }

  if (!picks) picks = fallbackRank(candidates, person);

  // ---------------- 3. reject anything not in the list ----------------
  const valid = new Set(candidates.map(c => c.ref));
  picks = picks.filter(p => valid.has(p.ref || p.id))
               .map(p => ({ ref: p.ref || p.id, why: p.why || "", eligibility_flag: !!p.eligibility_flag }))
               .slice(0, 5);

  // Only send back the new opportunities the picks actually reference, so the
  // client is not asked to save two dozen rows it will never look at.
  const keep = new Set(picks.map(p => p.ref));
  const newOnes = found.filter(f => keep.has(f.external_id));

  return json(200, { picks, found: newOnes, ranked_by: apiKey ? "ai" : "rules" });
};

/* ------------------------------ discovery ------------------------------ */

function buildQueries(org, person) {
  const qs = [];
  const areas = (person.focus_areas || []).filter(Boolean);
  areas.slice(0, 4).forEach(a => qs.push(a));
  if (areas.length > 1) qs.unshift(areas.slice(0, 2).join(" "));
  if (org.mission) {
    const words = String(org.mission).toLowerCase()
      .replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 4 && !STOPWORDS.has(w));
    if (words.length) qs.push(words.slice(0, 3).join(" "));
  }
  if (!qs.length) qs.push("nonprofit community services");
  return [...new Set(qs)].slice(0, 5);
}

const STOPWORDS = new Set([
  "their", "there", "through", "which", "where", "these", "those", "about",
  "provide", "providing", "provides", "support", "supporting", "people",
  "组织", "organization", "nonprofit", "mission", "committed", "dedicated",
  "helping", "serving", "communities", "community",
]);

async function searchGrantsGov(keyword) {
  const res = await fetch(GRANTS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      keyword,
      oppStatuses: "posted",
      eligibilities: "12",   // nonprofits with 501(c)(3) status
      rows: 20,
    }),
  });
  if (!res.ok) throw new Error("grants.gov " + res.status);
  const data = await res.json();
  const hits = (data.data && data.data.oppHits) || [];
  return hits.map(h => ({
    external_id: "gg:" + h.id,
    title: h.title,
    funder: h.agencyName || h.agency || "Federal agency",
    amount: "",
    deadline: normalizeDate(h.closeDate),
    url: "https://www.grants.gov/search-results-detail/" + h.id,
    tags: [],
    notes: h.oppNumber ? "Opportunity number " + h.oppNumber : "",
    source: "Grants.gov",
  })).filter(o => o.title);
}

function normalizeDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[1] + "-" + m[2];
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/* ------------------------------- ranking ------------------------------- */

function fallbackRank(candidates, person) {
  const areas = person.focus_areas || [];
  const today = Date.now();
  return candidates
    .map(c => {
      const hay = ((c.title || "") + " " + (c.notes || "")).toLowerCase();
      const overlap = areas.filter(a => hay.includes(a.split(" ")[0])).length
        + (c.tags || []).filter(t => areas.includes(t)).length;
      const days = c.deadline
        ? (new Date(c.deadline).getTime() - today) / 86400000 : 90;
      const runway = days < 7 ? -5 : days < 45 ? 3 : days < 120 ? 2 : 1;
      return { ref: c.ref, score: overlap * 10 + runway, why: "", eligibility_flag: false };
    })
    .sort((a, b) => b.score - a.score);
}

function buildPrompt(org, person, candidates) {
  return `You are helping a small nonprofit decide which funding opportunities deserve a
grant writer's limited hours this week.

THE ORGANIZATION
Name: ${org.name || "unknown"}
Based in ZIP: ${org.zip || "unknown"}
Mission: ${org.mission || "(not filled in)"}
Who they serve: ${org.population_served || "(not filled in)"}
What they do: ${org.program_description || "(not filled in)"}
Statement of need: ${org.need_statement || "(not filled in)"}
Annual budget: ${org.annual_budget || "(not filled in)"}

THE WRITER
Name: ${person.name}
Service area ZIP: ${person.zip || "unknown"}
Focus areas: ${(person.focus_areas || []).join(", ") || "(none set)"}

CANDIDATES
${JSON.stringify(candidates.map(c => ({
    ref: c.ref, title: c.title, funder: c.funder, amount: c.amount,
    deadline: c.deadline, tags: c.tags, notes: c.notes, source: c.origin,
  })), null, 1)}

Pick the five candidates most worth this writer's time, best first.

Rules you must follow:
- Choose ONLY from the candidates above, using their exact "ref" values. Never invent
  an opportunity, funder, deadline, or amount. Return fewer than five if fewer deserve it.
- Weigh real mission fit above keyword overlap. A large grant that does not match what
  this organization does is a worse use of a week than a small one that does.
- Prefer opportunities with enough runway to write something good.
- Set "eligibility_flag" true when something suggests this organization may not qualify:
  a geographic restriction that may not cover their ZIP, a budget floor they are likely
  under, a required track record. Flagging means "verify before writing," not "skip."
- "why" is one sentence under 25 words, addressed to the writer, naming the concrete
  reason it fits or the specific thing to check. No praise, no filler, no emoji.

Reply with JSON only, no preamble and no markdown fences:
{"picks":[{"ref":"...","why":"...","eligibility_flag":false}]}`;
}

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
