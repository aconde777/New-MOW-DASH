# Man of War — Sales Dashboard

A private, password-gated sales dashboard for tracking closes, setter activity, leaderboards, calendar history, and targets. Built as a single Node/Express app with a JSON-file datastore — no database server to manage.

## What's in it

- **Sales** — log closes (rep, program, amount, optional setter credit), closer leaderboard (today / week / month / all-time), 14-day revenue trend chart, recent closes log.
- **Setters** — log daily activity (calls made, appointments booked, show-ups), setter leaderboard with calls→appointment, appointment→show, and show→close conversion rates.
- **Calendar** — real month grid and week view. Click any day to see exactly what was logged on it. Permanent history — flip back to any past week or month.
- **Targets** — set revenue/closes/calls/appointments/shows goals scoped to the team, closers, or setters, for the current week or month, with live progress bars.
- **Team** — add/deactivate reps and setters, manage the list of programs you sell, configure an automatic end-of-day summary email (via Resend).

Login is a single shared dashboard password (not per-person accounts) — simplest for a small team.

## Running it locally

```
npm install
cp .env.example .env   # then edit DASHBOARD_PASSWORD and JWT_SECRET
npm start
```

Visit `http://localhost:3000`.

## Deploying to Railway (with data that actually survives redeploys)

This app stores its data as JSON files on disk. That's simple and reliable, but Railway's filesystem resets on every redeploy **unless you attach a persistent Volume**. Don't skip step 4 — it's the difference between "saved permanently" and losing everything the next time you push a change.

**1. Push this code to GitHub**
```
git init
git add .
git commit -m "Man of War sales dashboard"
```
Create a new repo on github.com, then:
```
git remote add origin https://github.com/YOUR_USERNAME/mow-dashboard.git
git branch -M main
git push -u origin main
```

**2. Create the Railway project**
On railway.app: New Project → Deploy from GitHub repo → select this repo. Railway will detect Node and run `npm install` + `npm start` automatically.

**3. Set environment variables**
In the Railway service's Variables tab, add:
- `DASHBOARD_PASSWORD` — the password you and Rafi will use to log in
- `JWT_SECRET` — any long random string
- `DATA_DIR` — `/data`
- `NODE_ENV` — `production`
- `RESEND_API_KEY` — optional, only if you want the automatic EOD email
- `RESEND_FROM` — optional, e.g. `Man of War <onboarding@resend.dev>`

**4. Attach a persistent Volume — this is the critical step**
In the service settings, go to the Volumes tab → New Volume → set the mount path to `/data`. This gives the container a disk that survives every future deploy. Without this, a redeploy wipes the JSON files and you lose all logged history.

**5. Generate a public URL**
Settings → Networking → Generate Domain. That's the link you and Rafi will bookmark.

## Notes

- Closes can optionally be tagged with the setter who booked the appointment — that's what feeds the setter leaderboard's "closes" and "revenue" columns, so you don't have to log the same close twice.
- Deactivating a rep hides them from the entry forms but keeps their historical data intact; deleting them removes the rep record but their past logs stay on the books.
- The EOD email needs both a Resend API key (free tier is fine — resend.com) and a recipient email set in the Team tab before it can send.
