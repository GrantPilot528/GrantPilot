/* Grant Pilot — My grants */

let OPPS = [];
let SUGGESTIONS = null;
let STATE = "idle";          // idle | loading | done | error
let RANKED_BY = null;

(async function () {
  if (!(await requireSession())) return;
  document.body.innerHTML = renderShell("dashboard.html");
  OPPS = await fetchOpportunities();
  render();
  maybeAutoDiscover();
})();

/* Run discovery on its own once a day, so nobody has to go looking. */
async function maybeAutoDiscover() {
  if (!CFG.AI_SUGGESTIONS_ENABLED) return;
  const key = "gp:lastfind:" + GP.profile.id;
  if (localStorage.getItem(key) === todayISO()) return;
  localStorage.setItem(key, todayISO());
  await discover({ quiet: true });
}

function fallbackList() {
  const order = [...GP.people].sort((a, b) => a.id.localeCompare(b.id));
  const pool = OPPS.filter(o => {
    if (o.status !== "open") return false;
    const d = daysUntil(o.deadline);
    return d === null || d >= 7;
  });
  const taken = new Set();
  let mine = [];
  for (const p of order) {
    const picks = pool
      .filter(o => !taken.has(o.id) && !(o.passed_by || []).includes(p.id))
      .map(o => {
        const overlap = (o.tags || []).filter(t => (p.focus_areas || []).includes(t)).length;
        const d = daysUntil(o.deadline);
        const urgency = d === null ? 0 : d < 30 ? 3 : d < 60 ? 2 : 1;
        return { o, score: overlap * 10 + urgency };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    picks.forEach(x => taken.add(x.o.id));
    if (p.id === GP.profile.id) mine = picks.map(x => x.o);
  }
  return mine;
}

function render() {
  const me = GP.profile;
  const s = statsFor(me.id, OPPS);
  const active = OPPS.filter(o => o.owner_id === me.id && WORKING_SET.includes(o.status));
  const closed = OPPS.filter(o => o.owner_id === me.id && !WORKING_SET.includes(o.status));
  const list = SUGGESTIONS || fallbackList();
  const group = GP.groups.find(g => g.id === me.group_id);

  $("#main").innerHTML = `
  <div class="stack">

    <div class="pagehead">
      <div>
        <div class="eyebrow">${fmtDate(todayISO())}</div>
        <h2>Good to see you, ${esc(me.full_name.split(" ")[0])}</h2>
        ${group ? `<p class="small muted" style="margin:6px 0 0">${esc(group.name)}</p>` : ""}
      </div>
      <div class="figures">
        <div class="stat"><b>${s.working}</b><span>In progress</span></div>
        <div class="stat"><b>${s.submitted}</b><span>Submitted</span></div>
        <div class="stat"><b>${s.awarded}</b><span>Awarded</span></div>
      </div>
    </div>

    <div class="card card-accent">
      <div class="between" style="align-items:center">
        <div class="eyebrow">Your goal</div>
        <button class="btn btn-sm btn-quiet" id="edit-goal">Edit</button>
      </div>
      <div style="margin-top:16px">${paceHTML(me, s.submitted)}</div>
      <div id="goal-editor" hidden class="divide">
        <div class="row" style="align-items:flex-end">
          <div><label class="lbl">Applications to submit</label>
            <input class="f" id="g-target" type="number" min="1" style="width:130px"
              value="${me.goal_target || ""}"></div>
          <div><label class="lbl">By</label>
            <input class="f" id="g-deadline" type="date" style="width:180px"
              value="${me.goal_deadline || ""}"></div>
          <button class="btn btn-teal" id="save-goal">Save goal</button>
        </div>
        <p class="tiny muted" style="margin:12px 0 0">Submitted, awarded, and not-awarded all count.
          The goal measures work you finished and sent, not outcomes you do not control.</p>
      </div>
    </div>

    <div>
      <div class="pagehead" style="margin-bottom:18px">
        <div>
          <div class="eyebrow">Suggested for you</div>
          <h2>Today's short list</h2>
          <p class="small muted" style="margin:6px 0 0;max-width:52ch">
            ${STATE === "loading" ? "Searching open federal opportunities and matching them to your work."
              : RANKED_BY === "ai" ? "Found and ranked against your mission. Nobody else on your team sees these five."
              : "Ranked by your focus areas and deadline. Nobody else on your team sees these five."}
          </p>
        </div>
        <button class="btn btn-sm ${STATE === "loading" ? "" : "btn-teal"}" id="find"
          ${STATE === "loading" ? "disabled" : ""}>
          ${STATE === "loading" ? "Searching" : "Find new grants"}</button>
      </div>

      ${STATE === "error" ? `<div class="notice err" style="margin-bottom:14px">
        The search service did not respond, so the list below is ranked from what you already have.
        If the site was deployed in the last minute or two, wait and try again.</div>` : ""}

      <div class="stack-sm">
        ${list.length === 0
          ? `<div class="card"><p class="muted" style="margin:0">Nothing to show yet.
              Press <strong>Find new grants</strong>, or add opportunities you already know about
              under <a href="opportunities.html">Opportunities</a>.</p></div>`
          : list.map(o => oppCardHTML(o, `
              <button class="btn btn-sm btn-quiet" data-pass="${o.id}">Not for me</button>
              <button class="btn btn-sm btn-teal" data-claim="${o.id}">Claim</button>`,
              { flag: o.eligibility_flag })).join("")}
      </div>
    </div>

    <div>
      <div class="eyebrow">In progress</div>
      <div class="stack-sm" style="margin-top:14px">
        ${active.length === 0
          ? `<div class="card"><p class="muted" style="margin:0">Nothing claimed yet.</p></div>`
          : active.map(o => oppCardHTML(o, `
              <select class="f" style="width:auto;font-size:13px;font-weight:600;padding:8px 10px"
                data-status="${o.id}">${statusOptions(o.status)}</select>
              <button class="btn btn-sm btn-quiet" data-release="${o.id}">Return to pool</button>`)).join("")}
      </div>
    </div>

    ${closed.length ? `<div>
      <div class="eyebrow">Finished and set aside</div>
      <div class="stack-sm" style="margin-top:14px">
        ${closed.map(o => `<div class="opp card-tight"><div class="between" style="align-items:center">
          <div><strong>${esc(o.title)}</strong>
            <span class="muted small"> &middot; ${esc(o.funder || "")}</span></div>
          <select class="f" style="width:auto;font-size:13px;font-weight:600;padding:8px 10px"
            data-status="${o.id}">${statusOptions(o.status)}</select>
        </div></div>`).join("")}
      </div></div>` : ""}

    ${!GP.org.mission ? `<div class="notice amber">
      <strong>Fill in your reusable answers first.</strong> The mission, need statement, and outcomes
      go into nearly every application, and the search uses them to judge whether an opportunity
      actually fits you. <a href="answers.html">Open reusable answers</a></div>` : ""}

  </div>`;

  wire();
}

function wire() {
  const edit = $("#edit-goal");
  if (edit) edit.onclick = () => { const e = $("#goal-editor"); e.hidden = !e.hidden; };

  const save = $("#save-goal");
  if (save) save.onclick = async () => {
    const target = parseInt($("#g-target").value, 10);
    const deadline = $("#g-deadline").value;
    if (!target || !deadline) return toast("Pick a number and a date", true);
    if (await saveProfile(GP.profile.id, {
      goal_target: target, goal_deadline: deadline,
      goal_start: GP.profile.goal_start || todayISO(),
    })) { toast("Goal saved"); render(); }
  };

  $$("[data-claim]").forEach(b => b.onclick = async () => {
    const id = b.dataset.claim;
    if (await saveOpportunity(id, { status: "claimed", owner_id: GP.profile.id })) {
      OPPS = await fetchOpportunities();
      if (SUGGESTIONS) SUGGESTIONS = SUGGESTIONS.filter(o => o.id !== id);
      toast("Claimed. It is off everyone else's list now.");
      render();
    }
  });

  $$("[data-pass]").forEach(b => b.onclick = async () => {
    const id = b.dataset.pass;
    const o = OPPS.find(x => x.id === id);
    if (!o) return;
    if (await saveOpportunity(id, { passed_by: [...(o.passed_by || []), GP.profile.id] })) {
      OPPS = await fetchOpportunities();
      if (SUGGESTIONS) SUGGESTIONS = SUGGESTIONS.filter(x => x.id !== id);
      render();
    }
  });

  $$("[data-release]").forEach(b => b.onclick = async () => {
    if (await saveOpportunity(b.dataset.release, { status: "open", owner_id: null })) {
      OPPS = await fetchOpportunities(); render();
    }
  });

  $$("[data-status]").forEach(sel => sel.onchange = async () => {
    if (await saveOpportunity(sel.dataset.status, { status: sel.value })) {
      OPPS = await fetchOpportunities(); toast("Status updated"); render();
    }
  });

  const find = $("#find");
  if (find) find.onclick = () => discover({ quiet: false });
}

/* --------------------------- discovery --------------------------- */

async function discover(opts) {
  const quiet = opts && opts.quiet;
  STATE = "loading";
  if (!quiet) render();

  try {
    const pool = OPPS.filter(o => o.status === "open" && !(o.passed_by || []).includes(GP.profile.id));
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org: {
          name: GP.org.name, mission: GP.org.mission,
          need_statement: GP.org.need_statement,
          program_description: GP.org.program_description,
          population_served: GP.org.population_served,
          annual_budget: GP.org.annual_budget,
          zip: GP.org.zip,
        },
        person: {
          name: GP.profile.full_name,
          zip: GP.profile.zip,
          focus_areas: GP.profile.focus_areas || [],
        },
        pool: pool.map(o => ({
          id: o.id, title: o.title, funder: o.funder, amount: o.amount,
          deadline: o.deadline, tags: o.tags, notes: o.notes,
        })),
        known_ids: OPPS.map(o => o.external_id).filter(Boolean),
      }),
    });
    if (!res.ok) throw new Error("suggest " + res.status);
    const data = await res.json();

    // Save anything new before showing it, so claiming works normally.
    if ((data.found || []).length) {
      const rows = data.found.map(f => ({
        org_id: GP.profile.org_id,
        title: f.title, funder: f.funder, amount: f.amount,
        deadline: f.deadline, url: f.url, notes: f.notes,
        tags: f.tags || [], source: f.source, external_id: f.external_id,
        status: "open",
      }));
      const { error } = await sb.from("opportunities")
        .upsert(rows, { onConflict: "org_id,external_id", ignoreDuplicates: true });
      if (error) console.error("saving found opportunities:", error);
      OPPS = await fetchOpportunities();
    }

    const byId = Object.fromEntries(OPPS.map(o => [o.id, o]));
    const byExt = Object.fromEntries(OPPS.filter(o => o.external_id).map(o => [o.external_id, o]));
    const ranked = (data.picks || [])
      .map(p => {
        const row = byId[p.ref] || byExt[p.ref];
        return row ? { ...row, why: p.why, eligibility_flag: p.eligibility_flag } : null;
      })
      .filter(Boolean);

    SUGGESTIONS = ranked.length ? ranked : null;
    RANKED_BY = data.ranked_by || null;
    STATE = ranked.length ? "done" : "error";
    if (!quiet && (data.found || []).length) {
      toast(data.found.length + " new opportunities added to your pool");
    }
  } catch (e) {
    console.error(e);
    STATE = "error";
    SUGGESTIONS = null;
  }
  render();
}
