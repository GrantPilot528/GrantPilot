/* Grant Pilot — shared core: auth, data access, page shell, helpers */

const CFG = window.GP_CONFIG || {};
const CONFIGURED = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

const sb = CONFIGURED
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

/* ------------------------------ constants ------------------------------ */

const STATUSES = [
  { id: "open",      label: "In pool",          tone: "" },
  { id: "claimed",   label: "Claimed",          tone: "" },
  { id: "drafting",  label: "Drafting",         tone: "amber" },
  { id: "review",    label: "Ready for review", tone: "amber" },
  { id: "submitted", label: "Submitted",        tone: "teal" },
  { id: "awarded",   label: "Awarded",          tone: "teal" },
  { id: "declined",  label: "Not awarded",      tone: "" },
  { id: "archived",  label: "Archived",         tone: "" },
];
const SUBMITTED_SET = ["submitted", "awarded", "declined"];
const WORKING_SET = ["claimed", "drafting", "review"];

const FOCUS_AREAS = [
  "mental health", "cancer & chronic illness", "caregivers", "youth & families",
  "seniors", "housing", "food security", "education", "workforce",
  "health access", "transportation", "arts & culture", "environment",
  "veterans", "immigrant & refugee services", "rural communities",
  "capacity building", "disaster relief",
];

const ORG_FIELDS = [
  { key: "legal_name",   label: "Legal name",     hint: "Exactly as on the IRS determination letter", rows: 1 },
  { key: "ein",          label: "EIN",            hint: "Public record", rows: 1 },
  { key: "website",      label: "Website",        rows: 1 },
  { key: "address",      label: "Mailing address", rows: 2 },
  { key: "mission",      label: "Mission statement", hint: "One or two sentences. Funders quote this back.", rows: 3 },
  { key: "need_statement", label: "Statement of need", hint: "The problem, with a source you can defend", rows: 6 },
  { key: "program_description", label: "Program description", hint: "What you actually do, week to week", rows: 6 },
  { key: "population_served", label: "Who you serve", rows: 3 },
  { key: "people_served", label: "People served last year", hint: "Number plus how you counted it", rows: 2 },
  { key: "outcomes",     label: "Outcomes and evidence", hint: "Stats you can back up if a program officer asks", rows: 5 },
  { key: "org_history",  label: "Organization history", rows: 4 },
  { key: "leadership",   label: "Leadership and board", rows: 3 },
  { key: "annual_budget", label: "Annual budget", rows: 2 },
  { key: "contact_block", label: "Authorized contact block", hint: "Name, title, email, phone", rows: 4 },
];

/* ------------------------------- helpers ------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso + "T00:00:00").getTime() - new Date(todayISO() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

function fmtDate(iso) {
  if (!iso) return "\u2014";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" });
}

function deadlineHTML(iso) {
  const d = daysUntil(iso);
  if (d === null) return `<span class="dl far">No deadline recorded</span>`;
  let cls = "far", note = `${d} days out`;
  if (d < 0) { note = "Closed"; }
  else if (d <= 10) { cls = "soon"; note = d === 0 ? "Due today" : `${d} days left`; }
  else if (d <= 25) { cls = "near"; note = `${d} days left`; }
  return `<span class="dl ${cls}">${fmtDate(iso)} &middot; ${note}</span>`;
}

function statusPill(status) {
  const s = STATUSES.find(x => x.id === status) || STATUSES[0];
  return `<span class="pill ${s.tone}">${s.label}</span>`;
}

function statusOptions(current) {
  return STATUSES.filter(s => s.id !== "open")
    .map(s => `<option value="${s.id}"${s.id === current ? " selected" : ""}>${s.label}</option>`)
    .join("");
}

function toast(msg, isError) {
  let t = $("#gp-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "gp-toast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "padding:12px 20px;border-radius:9px;font-size:13.5px;font-weight:600;z-index:99;" +
      "box-shadow:0 10px 34px rgba(0,0,0,.2);max-width:90vw;text-align:center;";
    document.body.appendChild(t);
  }
  t.style.background = isError ? "#A03528" : "#0B2E5C";
  t.style.color = "#fff";
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = "none"; }, 3000);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text || "");
    if (btn) {
      btn.textContent = "Copied"; btn.classList.add("done");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1500);
    }
    return true;
  } catch (e) {
    toast("Your browser blocked the copy. Select the text instead.", true);
    return false;
  }
}

/** Fallback wordmark if assets/logo.png is missing. */
function gpWordmark(img) {
  const s = document.createElement("span");
  s.className = "logo-word";
  s.innerHTML = 'Grant <span>Pilot</span>';
  img.replaceWith(s);
}

const logoHTML = (h) =>
  `<img src="assets/logo.png" alt="Grant Pilot"${h ? ` style="height:${h}"` : ""} onerror="gpWordmark(this)">`;

/* ------------------------------- session ------------------------------- */

const GP = { user: null, profile: null, org: null, people: [], groups: [] };

async function loadSession() {
  if (!CONFIGURED) return { state: "unconfigured" };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { state: "signed-out" };
  GP.user = session.user;

  const { data: profile, error } = await sb.from("profiles")
    .select("*").eq("id", session.user.id).maybeSingle();
  if (error) { console.error(error); return { state: "error", error }; }
  if (!profile) return { state: "needs-org" };
  GP.profile = profile;

  const [orgRes, peopleRes, groupRes] = await Promise.all([
    sb.from("orgs").select("*").eq("id", profile.org_id).maybeSingle(),
    sb.from("profiles").select("*").eq("org_id", profile.org_id).order("full_name"),
    sb.from("groups").select("*").eq("org_id", profile.org_id).order("name"),
  ]);

  GP.org = orgRes.data || {};
  GP.people = peopleRes.data || [];
  GP.groups = groupRes.error ? [] : (groupRes.data || []);
  if (groupRes.error) console.warn("groups table missing — run migration-002-groups.sql");

  return { state: "ready" };
}

async function requireSession() {
  if (!CONFIGURED) { document.body.innerHTML = notConfiguredHTML(); return false; }
  const res = await loadSession();
  if (res.state === "signed-out") { location.href = "index.html"; return false; }
  if (res.state === "needs-org") { location.href = "index.html#setup"; return false; }
  if (res.state === "error") {
    document.body.innerHTML = `<div class="banner err">Could not load your workspace. Check that
      the tables and policies from supabase/schema.sql were created.</div>`;
    return false;
  }
  return true;
}

function notConfiguredHTML() {
  return `<div class="wrap" style="max-width:600px;padding:80px 24px">
    <h2>Grant Pilot isn't connected yet</h2>
    <p class="lead" style="margin-top:14px">Open <code>assets/config.js</code> and paste in your
    Supabase project URL and publishable key, then redeploy. Steps are in <code>README.md</code>.</p>
  </div>`;
}

async function signOut() { await sb.auth.signOut(); location.href = "index.html"; }

const isAdmin = () => GP.profile && GP.profile.role === "admin";

/* -------------------------------- shell -------------------------------- */

const NAV_ITEMS = [
  { href: "dashboard.html",     label: "My grants" },
  { href: "opportunities.html", label: "Opportunities" },
  { href: "answers.html",       label: "Reusable answers" },
  { href: "team.html",          label: "Team" },
];

function renderShell(activeHref) {
  const tabs = NAV_ITEMS.map(n =>
    `<a href="${n.href}" class="${n.href === activeHref ? "active" : ""}">${n.label}</a>`).join("");

  return `
  <header class="appbar">
    <div class="wrap">
      <div class="row1">
        <a class="brand" href="dashboard.html">
          <img src="assets/logo.png" alt="Grant Pilot" onerror="gpWordmark(this)">
        </a>
        <span class="org">${esc(GP.org.name || "Your organization")}</span>
        <div class="spacer"></div>
        <span class="who"><b>${esc(GP.profile.full_name)}</b>${isAdmin() ? " &middot; admin" : ""}</span>
        <button class="signout" onclick="signOut()">Sign out</button>
      </div>
      <nav class="apptabs">${tabs}</nav>
    </div>
  </header>
  <main class="wrap" id="main" style="padding-top:34px"></main>
  <footer class="site"><div class="wrap">
    Grant Pilot helps you find, organize, and reuse your grant work. It does not submit applications
    and does not confirm that your organization is eligible &mdash; always read the funder's own guidelines.
  </div></footer>`;
}

/* ------------------------------ data access ---------------------------- */

async function fetchOpportunities() {
  const { data, error } = await sb.from("opportunities")
    .select("*").eq("org_id", GP.profile.org_id).order("deadline", { ascending: true });
  if (error) { toast("Could not load opportunities", true); return []; }
  return data || [];
}

async function saveOpportunity(id, patch) {
  const { error } = await sb.from("opportunities").update(patch).eq("id", id);
  if (error) toast("Change not saved", true);
  return !error;
}

async function insertOpportunity(row) {
  const { data, error } = await sb.from("opportunities")
    .insert({ ...row, org_id: GP.profile.org_id }).select().single();
  if (error) { toast("Could not add that opportunity", true); return null; }
  return data;
}

async function insertOpportunities(rows) {
  if (!rows.length) return 0;
  const { data, error } = await sb.from("opportunities")
    .insert(rows.map(r => ({ ...r, org_id: GP.profile.org_id }))).select();
  if (error) { console.warn("bulk insert:", error.message); return 0; }
  return (data || []).length;
}

async function deleteOpportunity(id) {
  const { error } = await sb.from("opportunities").delete().eq("id", id);
  if (error) toast("Could not delete that", true);
  return !error;
}

async function saveOrg(patch) {
  const { error } = await sb.from("orgs").update(patch).eq("id", GP.profile.org_id);
  if (error) { toast("Not saved \u2014 only admins can edit organization details", true); return false; }
  Object.assign(GP.org, patch);
  return true;
}

async function saveProfile(id, patch) {
  const { error } = await sb.from("profiles").update(patch).eq("id", id);
  if (error) { toast("Not saved", true); return false; }
  const p = GP.people.find(x => x.id === id);
  if (p) Object.assign(p, patch);
  if (GP.profile.id === id) Object.assign(GP.profile, patch);
  return true;
}

async function createGroup(name) {
  const { data, error } = await sb.from("groups")
    .insert({ org_id: GP.profile.org_id, name }).select().single();
  if (error) { toast("Could not create that group", true); return null; }
  GP.groups.push(data);
  return data;
}

async function renameGroup(id, name) {
  const { error } = await sb.from("groups").update({ name }).eq("id", id);
  if (error) { toast("Rename not saved", true); return false; }
  const g = GP.groups.find(x => x.id === id);
  if (g) g.name = name;
  return true;
}

async function removeGroup(id) {
  const { error } = await sb.from("groups").delete().eq("id", id);
  if (error) { toast("Could not delete that group", true); return false; }
  GP.groups = GP.groups.filter(g => g.id !== id);
  GP.people.forEach(p => { if (p.group_id === id) p.group_id = null; });
  return true;
}

async function createGroup(name) {
  const { data, error } = await sb.from("groups")
    .insert({ org_id: GP.profile.org_id, name }).select().single();
  if (error) { toast("Could not create that group", true); return null; }
  GP.groups.push(data);
  return data;
}

async function renameGroup(id, name) {
  const { error } = await sb.from("groups").update({ name }).eq("id", id);
  if (error) { toast("Rename failed", true); return false; }
  const g = GP.groups.find(x => x.id === id);
  if (g) g.name = name;
  return true;
}

async function removeGroup(id) {
  const { error } = await sb.from("groups").delete().eq("id", id);
  if (error) { toast("Could not delete that group", true); return false; }
  GP.groups = GP.groups.filter(g => g.id !== id);
  GP.people.forEach(p => { if (p.group_id === id) p.group_id = null; });
  return true;
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase();
}

/* --------------------------- goal / pace math -------------------------- */

function paceHTML(profile, doneCount, compact) {
  if (!profile.goal_target || !profile.goal_deadline) {
    return `<p class="small muted" style="margin:0">No goal set yet.</p>`;
  }
  const start = profile.goal_start || todayISO();
  const total = Math.max(1, (new Date(profile.goal_deadline) - new Date(start)) / 86400000);
  const elapsed = Math.min(total, Math.max(0, (new Date(todayISO()) - new Date(start)) / 86400000));
  const expected = (profile.goal_target * elapsed) / total;
  const left = daysUntil(profile.goal_deadline);
  const remaining = Math.max(0, profile.goal_target - doneCount);
  const perWeek = remaining / Math.max(0.15, (left || 0) / 7);
  const onPace = doneCount >= expected - 0.001;
  const pctDone = Math.min(100, (doneCount / profile.goal_target) * 100);
  const pctExp = Math.min(100, (expected / profile.goal_target) * 100);

  return `
    <div class="row" style="align-items:baseline;gap:10px;margin-bottom:${compact ? 8 : 12}px">
      <div class="tabnum" style="font-size:${compact ? 22 : 32}px;font-weight:650;letter-spacing:-.03em">
        ${doneCount}<span style="color:var(--ink-45);font-weight:500"> / ${profile.goal_target}</span>
      </div>
      <div class="small muted">submitted by ${fmtDate(profile.goal_deadline)}</div>
    </div>
    <div class="track">
      <div class="fill ${onPace ? "" : "behind"}" style="width:${pctDone}%"></div>
      <div class="marker" style="left:${pctExp}%" title="Where a steady pace would put you"></div>
    </div>
    <div class="between small muted" style="margin-top:9px">
      <span><strong style="color:${onPace ? "var(--teal-deep)" : "var(--amber)"}">
        ${onPace ? "On pace" : "Behind pace"}</strong> &middot; steady pace at ${expected.toFixed(1)}</span>
      <span class="tabnum">${left !== null && left >= 0
        ? `${left} days left &middot; ${perWeek.toFixed(1)}/week` : "Deadline passed"}</span>
    </div>`;
}

function isOnPace(profile, doneCount) {
  if (!profile.goal_target || !profile.goal_deadline) return null;
  const start = profile.goal_start || todayISO();
  const total = Math.max(1, (new Date(profile.goal_deadline) - new Date(start)) / 86400000);
  const elapsed = Math.min(total, Math.max(0, (new Date(todayISO()) - new Date(start)) / 86400000));
  return doneCount >= (profile.goal_target * elapsed) / total - 0.001;
}

function statsFor(personId, opps) {
  const mine = opps.filter(o => o.owner_id === personId);
  return {
    submitted: mine.filter(o => SUBMITTED_SET.includes(o.status)).length,
    working:   mine.filter(o => WORKING_SET.includes(o.status)).length,
    awarded:   mine.filter(o => o.status === "awarded").length,
    total: mine.length,
  };
}

/* ---------------------------- shared renderers ------------------------- */

function fieldHTML(f, value) {
  const control = f.rows > 1
    ? `<textarea class="f" rows="${f.rows}" data-key="${f.key}">${esc(value)}</textarea>`
    : `<input class="f" type="text" data-key="${f.key}" value="${esc(value)}">`;
  return `<div class="field">
    <div class="field-head">
      <label class="lbl">${f.label}</label>
      ${f.rows > 1 ? `<button class="copybtn" data-copy="${f.key}">Copy</button>` : ""}
    </div>
    ${f.hint ? `<div class="hint">${f.hint}</div>` : ""}
    ${control}
  </div>`;
}

function tagPickerHTML(selected, name) {
  return FOCUS_AREAS.map(t =>
    `<button class="tag ${selected.includes(t) ? "on" : ""}" data-tagfield="${name}" data-tag="${esc(t)}">${esc(t)}</button>`
  ).join(" ");
}

function oppCardHTML(o, rightHTML, opts = {}) {
  const tags = (o.tags || []).map(t => `<span class="tag tag-static">${esc(t)}</span>`).join(" ");
  return `<div class="opp ${opts.flag ? "flag" : ""}" data-id="${o.id}">
    <div class="between">
      <div style="flex:1;min-width:250px">
        <h3>${esc(o.title)}</h3>
        <div class="small muted" style="margin-top:4px">
          ${esc(o.funder || "Funder not recorded")}${o.amount ? " &middot; " + esc(o.amount) : ""}
          ${o.source ? ` &middot; ${esc(o.source)}` : ""}
        </div>
        <div style="margin-top:7px">${deadlineHTML(o.deadline)}</div>
        ${tags ? `<div class="row" style="gap:6px;margin-top:10px">${tags}</div>` : ""}
        ${o.why ? `<div class="why">${esc(o.why)}</div>` : ""}
        ${o.notes ? `<div class="small muted" style="margin-top:9px">${esc(o.notes)}</div>` : ""}
        ${o.url ? `<a class="small" style="font-weight:600;display:inline-block;margin-top:10px"
            href="${esc(o.url)}" target="_blank" rel="noreferrer">Open the funder's page &rarr;</a>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">${rightHTML}</div>
    </div>
  </div>`;
}
