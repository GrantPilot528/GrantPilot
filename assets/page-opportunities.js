/* Grant Pilot — Opportunities */

let OPPS = [];
let FILTER = "all";
let NEWTAGS = [];

(async function () {
  if (!(await requireSession())) return;
  document.body.innerHTML = renderShell("opportunities.html");
  OPPS = await fetchOpportunities();
  render();
})();

function render() {
  const shown = OPPS.filter(o =>
    FILTER === "all" ? true : FILTER === "open" ? o.status === "open" : o.status !== "open");

  $("#main").innerHTML = `
  <div class="stack" style="gap:26px">
    <div class="card">
      <span class="eyebrow-plain">Add an opportunity</span>
      <p class="small muted" style="margin:6px 0 16px;max-width:640px">
        Open federal opportunities are pulled in for you automatically each day. Add anything else
        you find here &mdash; local community foundations, corporate giving, or a funder someone
        told you about &mdash; and it joins the same ranked short lists.
      </p>
      <div class="grid-2">
        <div class="field"><label class="lbl">Opportunity name</label>
          <input class="f" id="n-title" placeholder="Name as the funder writes it"></div>
        <div class="field"><label class="lbl">Funder</label><input class="f" id="n-funder"></div>
        <div class="field"><label class="lbl">Amount</label>
          <input class="f" id="n-amount" placeholder="$25,000"></div>
        <div class="field"><label class="lbl">Deadline</label>
          <input class="f" id="n-deadline" type="date"></div>
        <div class="field"><label class="lbl">Link</label>
          <input class="f" id="n-url" placeholder="https://"></div>
        <div class="field"><label class="lbl">Geographic restriction</label>
          <div class="hint">ZIP, county, or state the funder limits to. Leave blank if national.</div>
          <input class="f" id="n-geo" placeholder="e.g. Tulare County, CA"></div>
      </div>
      <div class="field"><label class="lbl">Why it might fit</label>
        <textarea class="f" id="n-notes" rows="2"></textarea></div>
      <div class="field">
        <label class="lbl">Focus areas</label>
        <div class="row" style="gap:6px" id="tagpicker">${tagPickerHTML(NEWTAGS, "new")}</div>
      </div>
      <button class="btn btn-primary" id="add-opp">Add to pool</button>
    </div>

    <div>
      <div class="between" style="align-items:center;margin-bottom:12px">
        <div class="eyebrow">Pool &middot; ${OPPS.length} recorded</div>
        <div class="row" style="gap:6px">
          ${[["all", "All"], ["open", "Unclaimed"], ["taken", "Claimed"]].map(([id, label]) =>
            `<button class="btn btn-sm ${FILTER === id ? "btn-primary" : ""}" data-filter="${id}">${label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="stack-sm">
        ${shown.length === 0
          ? `<div class="card"><p class="muted" style="margin:0">Nothing here yet.</p></div>`
          : shown.map(o => oppCardHTML(o, `
              ${statusPill(o.status)}
              <span class="small muted">${o.owner_id
                ? esc((GP.people.find(p => p.id === o.owner_id) || {}).full_name || "Assigned")
                : "Unclaimed"}</span>
              <select class="f" style="width:auto;font-size:13px;padding:8px 10px" data-assign="${o.id}">
                <option value="">Return to pool</option>
                ${GP.people.map(p => `<option value="${p.id}"${p.id === o.owner_id ? " selected" : ""}>
                  Assign to ${esc(p.full_name)}</option>`).join("")}
              </select>
              ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-del="${o.id}">Delete</button>` : ""}
            `)).join("")}
      </div>
    </div>
  </div>`;

  wire();
}

function wire() {
  $$("[data-filter]").forEach(b => b.onclick = () => { FILTER = b.dataset.filter; render(); });

  $$('[data-tagfield="new"]').forEach(b => b.onclick = () => {
    const t = b.dataset.tag;
    NEWTAGS = NEWTAGS.includes(t) ? NEWTAGS.filter(x => x !== t) : [...NEWTAGS, t];
    b.classList.toggle("on");
  });

  $("#add-opp").onclick = async () => {
    const title = $("#n-title").value.trim();
    if (!title) return toast("An opportunity needs a name", true);
    const row = {
      title,
      funder: $("#n-funder").value.trim(),
      amount: $("#n-amount").value.trim(),
      deadline: $("#n-deadline").value || null,
      url: $("#n-url").value.trim(),
      geo_restriction: $("#n-geo").value.trim(),
      notes: $("#n-notes").value.trim(),
      tags: NEWTAGS,
      status: "open",
      source: "added by hand",
    };
    const created = await insertOpportunity(row);
    if (created) {
      NEWTAGS = [];
      OPPS = await fetchOpportunities();
      toast("Added to the pool");
      render();
    }
  };

  $$("[data-assign]").forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.assign;
    const owner = sel.value || null;
    const current = OPPS.find(o => o.id === id);
    const status = owner ? (current.status === "open" ? "claimed" : current.status) : "open";
    if (await saveOpportunity(id, { owner_id: owner, status })) {
      OPPS = await fetchOpportunities(); render();
    }
  });

  $$("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this opportunity for the whole team?")) return;
    if (await deleteOpportunity(b.dataset.del)) {
      OPPS = await fetchOpportunities(); render();
    }
  });
}
