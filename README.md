# PortfolioForge — VC Fund Portfolio Construction

A web application for modeling venture capital fund portfolio construction and
returns — in the spirit of **Carta's Tactyc**, with the modeling concepts from
the **3iP Fund II** model and the **SVB construction template** rebuilt as an
interactive app (no spreadsheets) backed by a real database.

![overview](docs/overview.png)

## Running the app

```bash
npm install      # first time only
npm run dev      # starts on http://localhost:4321
```

Then open **http://localhost:4321**.

For a production build:

```bash
npm run build && npm start
```

Locally, with no environment variables set, data is stored in a local libSQL
file at `data/portfolio.db` — nothing to configure.

## Deploy to Vercel

The app deploys to Vercel as a standard Next.js project, but Vercel's serverless
filesystem is **read-only**, so the local SQLite file can't be used in
production. Point it at a **Turso** database (serverless, SQLite-compatible)
instead — the code auto-switches to Turso when the env vars below are present.

1. **Create a Turso database** (free): install the CLI and run
   ```bash
   turso db create portfolioforge
   turso db show portfolioforge --url        # -> TURSO_DATABASE_URL
   turso db tokens create portfolioforge     # -> TURSO_AUTH_TOKEN
   ```
   (or create one in the Turso web dashboard).
2. **Import the repo** at [vercel.com/new](https://vercel.com/new) — Vercel
   auto-detects Next.js.
3. In the Vercel project → **Settings → Environment Variables**, add:
   - `TURSO_DATABASE_URL` — e.g. `libsql://portfolioforge-<org>.turso.io`
   - `TURSO_AUTH_TOKEN` — the token from step 1
4. **Deploy** (or redeploy). On first load the app seeds the default scenario
   into Turso, and saving/loading works.

The same env vars work locally too (drop them in `.env.local`) if you want local
dev to share the Turso database instead of the local file.

## What it does

Everything recalculates instantly as you type, and every change auto-saves to
the database.

### Sections
- **Overview** — headline metrics (Fund Size, Invested, Gross MOIC, Net TVPI/DPI,
  Gross/Net IRR, Loss Ratio), the **J-curve**, annual capital-calls-vs-distributions,
  outcome distribution donut, capital deployed by stage, and a returns breakdown.
- **Construction** — the inputs:
  - *Fund characteristics*: size, inception date, fund life, investment period.
  - *Construction strategy*: # of deals, initial check size, entry round, pacing,
    reserve ratio, and a **Uniform / Custom** mode toggle (as in the SVB model).
  - *Follow-on strategy*: per-tier deal counts with **Pro-Rata** or **Fixed $** checks.
  - *Market assumptions*: round sizes & post-money valuations per stage
    (Pre-Seed → Series G), with implied dilution and graduation rates.
  - *Fees & expenses*: management fee with step-down + floor, fund expenses, recycling.
  - *Carry & waterfall*: preferred return (hurdle), carried interest, GP catch-up.
  - A live **capital deployment** summary (investable capital, reserves, % deployed).
- **Investments** — the editable **schedule of investments**: per-company entry round,
  entry date, ownership at entry, invested capital, exit round, exit valuation,
  ownership at exit, proceeds, gross MOIC and outcome band. Edit exit assumptions to
  shape the portfolio; switch to Custom mode to edit every company individually.
- **Cash Flows** — the **European distribution waterfall** (return of capital →
  preferred return → GP catch-up → carry split) and a quarterly/annual cash-flow schedule.
- **Returns** — gross vs. net performance, net TVPI/DPI value-creation over time,
  gross MOIC by company, and **concentration sensitivity** (MOIC excluding the top 1–3 deals).
- **Scenarios** — save, compare, duplicate and delete multiple funds/scenarios.

## Architecture

| Layer | Tech |
|------|------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Charts | Recharts |
| Calculation engine | Pure TypeScript (`src/lib/engine.ts`) — runs client-side for instant reactivity |
| API | Next.js route handlers (`src/app/api/scenarios/...`) |
| Database | **libSQL** (`@libsql/client`) — local file `data/portfolio.db` in dev, **Turso** in production |

### Key files
- `src/lib/types.ts` — the domain model (fund settings, fees, waterfall, strategy, companies).
- `src/lib/engine.ts` — ownership/dilution progression, exit proceeds, cash-flow schedule,
  the carry waterfall, XIRR, and all aggregate metrics.
- `src/lib/defaults.ts` — the seeded **3iP Fund II** base-case model.
- `src/lib/db.ts` — libSQL/Turso persistence (scenarios stored as model JSON + denormalized headline columns).
- `src/components/sections/*` — the six UI sections.

### Data & persistence
Scenarios are stored in a libSQL database — a local `data/portfolio.db` file in dev,
or a hosted **Turso** database in production (see *Deploy to Vercel*). On first run the
app seeds a **"3iP Fund II — Base Case"** scenario. Your edits auto-save.

## Modeling notes
- **Ownership** at each round updates as `own × (1 − roundSize/postMoney) + investThisRound/postMoney`,
  so pro-rata exactly maintains ownership and fixed/no-participation dilutes correctly.
- **Exit proceeds** = ownership at exit × exit valuation. An exit valuation of `$0` is a full write-off.
- **Net returns** are computed after management fees, fund expenses and a whole-fund European
  carry waterfall with a compounding preferred return and GP catch-up.
- **IRR** uses a Newton–Raphson XIRR with a bisection fallback on the dated cash flows.
