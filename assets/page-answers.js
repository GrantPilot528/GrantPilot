/* Grant Pilot — Reusable answers */

let DIRTY = {};
let TIMER = null;

(async function () {
  if (!(await requireSession())) return;
  document.body.innerHTML = renderShell("answers.html");
  render();
})();

function render() {
  const editable = isAdmin();
  $("#main").innerHTML = `
  <div class="stack" style="gap:26px">
    <div>
      <span class="eyebrow">Write once, paste everywhere</span>
      <h2 style="font-size:26px;margin:8px 0 10px">${esc(GP.org.name || "Your organization")}'s standing answers</h2>
      <p class="lead" style="font-size:15px;margin:0;max-width:680px">
        These are the answers nearly every application asks for. Copy one into the funder's form,
        then tailor the wording to that funder &mdash; editing your copy inside an application never
        changes the master text here. The daily feed also reads these to judge whether an
        opportunity actually fits you.
        ${editable ? "" : " Only administrators can edit them."}
      </p>
    </div>

    <div class="card" id="orgfields">
      ${ORG_FIELDS.map(f => fieldHTML(f, GP.org[f.key] || "")).join("")}
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="small muted" id="savestate">All changes saved</span>
        ${editable ? "" : `<span class="small muted">Read-only</span>`}
      </div>
    </div>

    <div class="card">
      <span class="eyebrow">Your own block</span>
      <div style="height:12px"></div>
      <div class="field">
        <div class="field-head">
          <label class="lbl">Signature block</label>
          <button class="copybtn" data-copysig>Copy</button>
        </div>
        <div class="hint">Name, title, email, phone &mdash; yours, not the organization's.</div>
        <textarea class="f" rows="4" id="sig">${esc(GP.profile.signature || "")}</textarea>
      </div>
    </div>
  </div>`;

  wire(editable);
}

function wire(editable) {
  $$("#orgfields [data-key]").forEach(el => {
    if (!editable) { el.setAttribute("readonly", "readonly"); el.style.background = "var(--paper)"; return; }
    el.addEventListener("input", () => {
      DIRTY[el.dataset.key] = el.value;
      $("#savestate").textContent = "Saving\u2026";
      clearTimeout(TIMER);
      TIMER = setTimeout(flush, 900);
    });
  });

  $$("[data-copy]").forEach(b => b.onclick = () => {
    const el = $(`#orgfields [data-key="${b.dataset.copy}"]`);
    copyText(el ? el.value : "", b);
  });

  const sig = $("#sig");
  sig.addEventListener("input", () => {
    clearTimeout(TIMER);
    TIMER = setTimeout(async () => {
      await saveProfile(GP.profile.id, { signature: sig.value });
    }, 900);
  });
  $("[data-copysig]").onclick = e => copyText(sig.value, e.target);
}

async function flush() {
  const patch = DIRTY; DIRTY = {};
  if (!Object.keys(patch).length) return;
  const ok = await saveOrg(patch);
  $("#savestate").textContent = ok ? "All changes saved" : "Not saved";
}
