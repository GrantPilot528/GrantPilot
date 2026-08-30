# Grant Pilot

Grant discovery and application tracking for small nonprofit teams. Any nonprofit
can create an account, invite their team, and give each writer a ranked short list
of funding matched to their focus areas and service area.

Static front end, Supabase for accounts and data, one serverless function for the
AI ranking. No build step — the files you see are the files that ship.

```
index.html            marketing home, sign in, register, organization setup
dashboard.html        a writer's goal, short list, and work in progress
opportunities.html    the shared pool: add, assign, track
answers.html          reusable org answers (mission, need, outcomes, contact block)
team.html             admin: people, ZIP codes, focus areas, deadlines, team code
assets/               theme, shared core, one script per page, logo
netlify/functions/    suggest.js — pulls real federal grants, ranks with Claude
supabase/schema.sql   tables, functions, and row-level security policies
```

---

## 1. Put it on GitHub

```bash
cd grant-pilot
git init
git add .
git commit -m "Grant Pilot"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/grant-pilot.git
git push -u origin main
```

`assets/config.js` is committed on purpose. The Supabase anon key is designed to be
public — it only grants what the row-level security policies allow. Your Anthropic
API key is **not** in the repo and must never be; it lives as an environment
variable on Netlify. `.gitignore` already excludes `.env` files.

## 2. Set up the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and Run.
   Then run `supabase/schema-v2.sql` the same way to add groups. If you set the
   database up earlier, you only need schema-v2.sql — it is safe on existing data.
   Then run `supabase/migration-002-groups.sql` the same way. If you already had
   an earlier version running, the migration is all you need — it is safe to run
   more than once.
3. Go to **Authentication → Providers → Email** and turn **Confirm email** off
   while you are testing. Supabase's built-in email sender is rate-limited to a
   handful of messages per hour and is not meant for production. When you are
   ready for real users, turn confirmation back on and connect an SMTP provider
   under **Project Settings → Auth → SMTP**.
4. Copy your **Project URL** and **anon public** key from
   **Project Settings → API** into `assets/config.js`. Commit and push.

## 3. Deploy

1. At [netlify.com](https://netlify.com), choose **Add new site → Import an
   existing project**, and pick your GitHub repo.
2. Build command: leave blank. Publish directory: `.`
3. Deploy. You get a URL like `grant-pilot.netlify.app`; rename it under
   **Site configuration → Change site name**, or attach your own domain under
   **Domain management**.
4. Every `git push` to `main` redeploys automatically.

## 4. Turn on AI ranking

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. In Netlify: **Site configuration → Environment variables → Add**, name
   `ANTHROPIC_API_KEY`, value your key. Redeploy.
3. The **Rank with AI** button on the dashboard now works.

Skip this step if you want. Without it the app ranks by focus-area overlap and
deadline urgency, which is a reasonable second-best.

---

## What the AI actually does, and what it can't

Opportunities arrive on their own. The first time someone opens their dashboard
each day, the app runs one federal search per focus area, adds anything new to the
organization's shared pool, ranks the result, and shows it. Nobody has to go
looking. `netlify/functions/suggest.js` does two things:

1. **Fetches real federal opportunities** from the public Grants.gov search API,
   using each writer's focus areas as keywords, filtered to 501(c)(3) eligibility.
   This runs server-side because Grants.gov sends no CORS headers.
2. **Ranks the combined pool** — those federal results plus whatever your team
   entered — against your organization's own mission, need statement, program
   description, and the writer's ZIP. It returns five picks, each with a one-line
   reason and an eligibility flag when something needs checking before you write.

The model is never asked to *produce* opportunities, only to reorder and annotate
a list it was handed. Every id it returns is checked against that list before
anything reaches a user, so a hallucinated funder cannot make it to the screen.

**What ZIP codes do and do not do.** A ZIP tells the ranker to flag opportunities
whose geographic restrictions may not cover your service area, and to weight local
relevance. It cannot conjure local foundation grants. There is no free, machine
-readable source of private foundation opportunities by ZIP — that data sits behind
Candid's Foundation Directory or a tool like Instrumentl. Free options: your
county's community foundation publishes its own deadlines, and Candid's Funding
Information Network gives free in-person database access at partner libraries. Add
what you find under Opportunities and the ranking works on it like anything else.

## Groups

Admins create groups and name them whatever fits — by program, chapter, cohort,
or region. Each group shows its own totals plus how many members are on or behind
pace, and every member card underneath shows their goal, progress, ZIP, and focus
areas. Admins can set a goal for anyone; writers can only change their own. People
with no group appear under a final band, so nobody is hidden.

## Groups

Administrators create groups on the Team page and rename them by typing over the
name. Assign people with the Group dropdown on each person's row. Each group card
shows combined work in progress, submitted, and awarded for its members, plus the
sum of their individual goals. Admins can set any person's goal target and date
from the same row; writers can set their own.

Groups are organizational, not permissions. Everyone in the organization still sees
the same opportunity pool and the same reusable answers.

## Where suggestions come from

The dashboard runs a search automatically the first time each person opens it on a
given day, and the **Find new grants** button runs it on demand. The search hits the
public Grants.gov API using that person's focus areas and your mission text,
filtered to opportunities open to 501(c)(3) organizations. New results are saved to
your pool, then ranked against your organization's actual profile.

That covers federal funding. It does not cover private foundations, because no free
machine-readable source of foundation opportunities exists. Those get added by hand
under Opportunities, from your community foundation's site or a free session at a
Candid Funding Information Network library. Once added, they are ranked alongside
everything else.

## Permissions

| | Administrator | Grant writer |
|---|---|---|
| Reusable answers | edit | read |
| Groups: create, rename, delete | yes | no |
| Move people between groups | yes | no |
| Set anyone's goal, ZIP, role, focus | yes | own only |
| Create, rename, delete groups | yes | no |
| Assign people to groups | yes | no |
| Set anyone's goal | yes | own only |
| Add / assign opportunities | yes | yes |
| Delete opportunities | yes | no |
| See the invite link and team code | yes | no |

Row-level security enforces all of this in the database, not just in the interface.
One organization can never read another's rows. Profiles and organizations are
created only through the `create_org` and `join_org` functions, so nobody can
attach themselves to a team they weren't given the code for.

## Before real users

- **Back up.** Supabase's free plan has no automated backups and pauses projects
  after a week of inactivity. Use **Download a backup** on the Team page weekly,
  or move to the $25/month plan.
- **Turn email confirmation back on** and connect an SMTP provider, or anyone can
  register with an address they don't own.
- **Rotate the Anthropic key** if it is ever pasted anywhere but Netlify's
  environment variables.
- **Keep client data out.** This holds grant pipeline information. It is not built
  for patient records, donor PII, or anything covered by HIPAA.
