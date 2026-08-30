/* Grant Pilot — Team and groups */

let OPPS = [];

(async function () {
  if (!(await requireSession())) return;
  document.body.innerHTML = renderShell("team.html");
  OPPS = await fetchOpportunities();
  render();
})();

function inviteLink() {
  return location.origin + "/?join=" + (GP.org.join_code || "");
}

function render() {
  const admin = isAdmin();
  const totals = OPPS.reduce((a, o) => {
    if (SUBMITTED_SET.includes(o.status)) a.submitted++;
    if (WORKING_SET.includes(o.status)) a.working++;
    if (o.status === "awarded") a.awarded++;
    if (o.status === "open") a.pool++;
    return a;
  }, { submitted: 0, working: 0, awarded: 0, pool: 0 });

  const upcoming = OPPS
    .filter(o => o.owner_id && !["archived", "awarded", "declined"].includes(o.status))
    .map(o => ({ o, d: daysUntil(o.deadline) }))
    .filter(x => x.d !== null && x.d >= 0 && x.d <= 30)
    .sort((a, b) => a.d - b.d);

  const ungrouped = GP.people.filter(p => !p.group_id);

  $("#main").innerHTML = `
  <div class="stack">

    <div class="between" style="align-items:flex-end">
      <div>
        <div class="eyebrow">Organization</div>
        <h2 style="margin-top:6px">${esc(GP.org.name || "Your organization")}</h2>
      </div>
      <div class="row" style="gap:26px">
        <div class="stat"><b>${totals.pool}</b><span>Unclaimed</span></div>
        <div class="stat"><b>${totals.working}</b><span>In progress</span></div>
        <div class="stat"><b>${totals.submitted}</b><span>Submitted</span></div>
        <div class="stat"><b>${totals.awarded}</b><span>Awarded</span></div>
      </div>
    </div>

    ${admin ? `<div class="card card-accent">
      <div class="eyebrow">Invite someone</div>
      <p class="small muted" style="margin:8px 0 14px;max-width:60ch">
        Send this link. It opens sign-up with your team code already filled in, so nobody
        accidentally starts a second organization.</p>
      <div class="row" style="gap:10px;align-items:stretch">
        <input class="f" id="invitelink" readonly style="flex:1;min-width:250px;font-size:13px"
          value="${esc(inviteLink())}">
        <button class="btn btn-teal" id="copylink">Copy link</button>
      </div>
      <div class="row" style="gap:14px;margin-top:14px;align-items:center">
        <span class="tiny muted">Or read them the code</span>
        <code style="font-size:15px;font-weight:700;letter-spacing:.1em;background:var(--navy-tint);
          color:var(--navy);padding:7px 13px;border-radius:var(--r-sm)">${esc(GP.org.join_code || "-")}</code>
        <button class="btn btn-sm btn-quiet" id="copycode">Copy code</button>
        <div style="flex:1"></div>
        <button class="btn btn-sm btn-quiet" id="backup">Download a backup</button>
      </div>
    </div>` : ""}

    <div>
      <div class="between" style="align-items:flex-end;margin-bottom:16px">
        <div>
          <div class="eyebrow">Groups</div>
          <h2 style="margin-top:6px">Who is working on what</h2>
        </div>
        ${admin ? `<div class="row" style="gap:8px">
          <input class="f" id="newgroup" placeholder="New group name" style="width:220px">
          <button class="btn btn-primary" id="addgroup">Create group</button>
        </div>` : ""}
      </div>

      <div class="stack">
        ${GP.groups.map(g => groupCard(g, GP.people.filter(p => p.group_id === g.id), admin)).join("")}
        ${groupCard(null, ungrouped, admin)}
      </div>
    </div>

    <div>
      <div class="eyebrow">Deadlines in the next 30 days</div>
      <div class="stack-sm" style="margin-top:14px">
        ${upcoming.length === 0
          ? `<div class="card"><p class="muted" style="margin:0">Nothing due in the next 30 days.</p></div>`
          : upcoming.map(({ o, d }) => `<div class="opp card-tight"
              style="border-left:3px solid ${d <= 10 ? "var(--rust)" : "var(--amber)"}">
              <div class="between" style="align-items:center">
                <div><strong>${esc(o.title)}</strong>
                  <span class="muted small"> &middot; ${esc((GP.people.find(x => x.id === o.owner_id) || {}).full_name || "unassigned")}</span></div>
                ${deadlineHTML(o.deadline)}
              </div></div>`).join("")}
      </div>
    </div>
  </div>`;

  wire(admin);
}

function groupCard(group, members, admin) {
  if (!group && members.length === 0) return "";

  const agg = members.reduce((a, p) => {
    const s = statsFor(p.id, OPPS);
    a.submitted += s.submitted; a.working += s.working; a.awarded += s.awarded;
    a.target += p.goal_target || 0;
    return a;
  }, { submitted: 0, working: 0, awarded: 0, target: 0 });

  const header = group
    ? `<h3>${admin
        ? `<input class="gname" data-gname="${group.id}" value="${esc(group.name)}">`
        : esc(group.name)}</h3>`
    : `<h3 style="color:var(--ink-45)">Not in a group</h3>`;

  return `<div class="groupcard">
    <header>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${header}
        <span class="pill">${members.length} ${members.length === 1 ? "person" : "people"}</span>
      </div>
      <div class="row" style="gap:20px">
        <div class="stat"><b>${agg.working}</b><span>Working</span></div>
        <div class="stat"><b>${agg.submitted}${agg.target ? " / " + agg.target : ""}</b><span>Submitted</span></div>
        <div class="stat"><b>${agg.awarded}</b><span>Awarded</span></div>
        ${group && admin ? `<button class="btn btn-sm btn-danger" data-delgroup="${group.id}">Delete</button>` : ""}
      </div>
    </header>
    <div class="body">
      ${members.length === 0
        ? `<p class="muted small" style="margin:18px 0">No one in this group yet.</p>`
        : members.map(p => memberRow(p, admin)).join("")}
    </div>
  </div>`;
}

function memberRow(p, admin) {
  const s = statsFor(p.id, OPPS);
  const canEdit = admin || p.id === GP.profile.id;
  return `<div class="member">
    <div style="flex:1;min-width:280px">
      <div class="row" style="gap:12px;align-items:center">
        <div class="avatar">${esc(initials(p.full_name))}</div>
        <div>
          <div style="font-weight:700;font-size:15.5px;letter-spacing:-.015em">${esc(p.full_name)}</div>
          <div class="tiny muted">${p.role === "admin" ? "Administrator" : "Grant writer"}${
            p.zip ? " &middot; " + esc(p.zip) : ""}</div>
        </div>
      </div>

      <div class="row" style="gap:12px;margin-top:14px;align-items:flex-end">
        ${admin ? `<div><label class="lbl">Group</label>
          <select class="f" style="width:190px" data-group="${p.id}">
            <option value="">Not in a group</option>
            ${GP.groups.map(g => `<option value="${g.id}"${g.id === p.group_id ? " selected" : ""}>
              ${esc(g.name)}</option>`).join("")}
          </select></div>` : ""}
        <div><label class="lbl">ZIP</label>
          <input class="f" style="width:110px" data-zip="${p.id}" value="${esc(p.zip || "")}"
            inputmode="numeric" maxlength="10" ${canEdit ? "" : "readonly"}></div>
        ${admin && p.id !== GP.profile.id ? `<div><label class="lbl">Role</label>
          <select class="f" style="width:150px" data-role="${p.id}">
            <option value="writer"${p.role === "writer" ? " selected" : ""}>Grant writer</option>
            <option value="admin"${p.role === "admin" ? " selected" : ""}>Administrator</option>
          </select></div>` : ""}
      </div>

      <div style="margin-top:16px">
        <div class="eyebrow" style="margin-bottom:8px">Focus areas</div>
        <div class="row" style="gap:6px">
          ${FOCUS_AREAS.map(t => `<button class="tag ${(p.focus_areas || []).includes(t) ? "on" : ""}"
            data-pt="${p.id}" data-tag="${esc(t)}" ${canEdit ? "" : "disabled"}>${esc(t)}</button>`).join("")}
        </div>
      </div>
    </div>

    <div style="min-width:270px">
      ${paceHTML(p, s.submitted)}
      ${canEdit ? `<div class="row" style="gap:8px;margin-top:14px;align-items:flex-end">
        <div><label class="lbl">Goal</label>
          <input class="f" type="number" min="1" style="width:90px" data-gt="${p.id}"
            value="${p.goal_target || ""}" placeholder="12"></div>
        <div><label class="lbl">By</label>
          <input class="f" type="date" style="width:170px" data-gd="${p.id}"
            value="${p.goal_deadline || ""}"></div>
        <button class="btn btn-sm btn-teal" data-savegoal="${p.id}">Save</button>
      </div>` : ""}
      <div class="row" style="gap:22px;margin-top:16px">
        <div class="stat"><b>${s.working}</b><span>Working</span></div>
        <div class="stat"><b>${s.submitted}</b><span>Submitted</span></div>
        <div class="stat"><b>${s.awarded}</b><span>Awarded</span></div>
      </div>
    </div>
  </div>`;
}

function wire(admin) {
  const cl = $("#copylink");
  if (cl) cl.onclick = async () => {
    $("#invitelink").select();
    await copyText(inviteLink(), null);
    toast("Invite link copied");
  };

  const cc = $("#copycode");
  if (cc) cc.onclick = async () => { await copyText(GP.org.join_code, null); toast("Team code copied"); };

  const bk = $("#backup");
  if (bk) bk.onclick = () => {
    const blob = new Blob([JSON.stringify(
      { org: GP.org, groups: GP.groups, people: GP.people, opportunities: OPPS }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grant-pilot-backup-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const add = $("#addgroup");
  if (add) add.onclick = async () => {
    const name = $("#newgroup").value.trim();
    if (!name) return toast("Give the group a name", true);
    if (await createGroup(name)) { toast("Group created"); render(); }
  };

  $$("[data-gname]").forEach(inp => {
    let t;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (inp.value.trim()) await renameGroup(inp.dataset.gname, inp.value.trim());
      }, 700);
    });
  });

  $$("[data-delgroup]").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this group? The people in it stay, they just become ungrouped.")) return;
    if (await removeGroup(b.dataset.delgroup)) { toast("Group deleted"); render(); }
  });

  $$("[data-group]").forEach(sel => sel.onchange = async () => {
    if (await saveProfile(sel.dataset.group, { group_id: sel.value || null })) {
      toast("Moved"); render();
    }
  });

  $$("[data-zip]").forEach(inp => {
    let t;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => saveProfile(inp.dataset.zip, { zip: inp.value.trim() }), 800);
    });
  });

  $$("[data-role]").forEach(sel => sel.onchange = async () => {
    if (await saveProfile(sel.dataset.role, { role: sel.value })) toast("Role updated");
  });

  $$("[data-pt]").forEach(b => b.onclick = async () => {
    const id = b.dataset.pt, tag = b.dataset.tag;
    const p = GP.people.find(x => x.id === id);
    const areas = p.focus_areas || [];
    b.classList.toggle("on");
    await saveProfile(id, { focus_areas: areas.includes(tag) ? areas.filter(x => x !== tag) : [...areas, tag] });
  });

  $$("[data-savegoal]").forEach(b => b.onclick = async () => {
    const id = b.dataset.savegoal;
    const target = parseInt($(`[data-gt="${id}"]`).value, 10);
    const deadline = $(`[data-gd="${id}"]`).value;
    if (!target || !deadline) return toast("Enter a number and a date", true);
    const p = GP.people.find(x => x.id === id);
    if (await saveProfile(id, {
      goal_target: target, goal_deadline: deadline,
      goal_start: (p && p.goal_start) || todayISO(),
    })) { toast("Goal saved"); render(); }
  });
}
