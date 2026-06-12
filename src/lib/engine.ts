// ============================================================================
// VC Fund Portfolio Construction — calculation engine.
//
// Pure functions (no I/O) so the same code runs on the client for instant
// reactivity and could run on the server. Given a FundModel it produces a
// ComputedModel: per-company results, a quarterly cash-flow schedule with an
// European carry waterfall, and aggregate fund metrics (MOIC / TVPI / DPI /
// IRR, loss ratios, sensitivity).
// ============================================================================

import {
  STAGES,
  Stage,
  FundModel,
  Company,
  CompanyResult,
  CashFlowPeriod,
  FundMetrics,
  ComputedModel,
  AnnualCashFlow,
  StageExposure,
  MarketAssumption,
} from "./types";

const MS_PER_DAY = 86_400_000;

function stageIndex(s: Stage): number {
  return STAGES.indexOf(s);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + Math.round(months));
  return d;
}

function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function marketFor(market: MarketAssumption[], stage: Stage): MarketAssumption {
  return (
    market.find((m) => m.stage === stage) ?? {
      stage,
      roundSize: 0,
      postMoneyValuation: 0,
      graduationRate: 0,
    }
  );
}

// ----------------------------------------------------------------------------
// Company generation (Uniform mode) — build the schedule of investments from
// the construction strategy. In Custom mode the stored companies are used.
// ----------------------------------------------------------------------------

export function generateUniformCompanies(model: FundModel): Company[] {
  const { construction: c, settings } = model;
  const companies: Company[] = [];
  const inception = new Date(settings.inceptionDate);

  for (let i = 0; i < c.numDeals; i++) {
    const tier = i + 1; // 1-indexed rank; follow-ons go to earliest deals first
    const followOnChecks: number[] = c.followOnCounts.map((count, k) => {
      const participates = tier <= count;
      if (!participates) return 0;
      if (c.followOnStrategy === "Fixed Amount") {
        return c.followOnFixedChecks[k] ?? 0;
      }
      return -1; // sentinel: pro-rata, resolved in computeCompany
    });

    // Spread initial checks out by pacing.
    const offsetMonths = c.initialChecksPerMonth > 0 ? i / c.initialChecksPerMonth : 0;

    // Default exit round: deeper for earlier (stronger) deals so the uniform
    // portfolio shows a realistic distribution of outcomes. Overridden freely.
    const entryIdx = stageIndex(c.initialRound);
    const maxRounds = Math.min(4, STAGES.length - 1 - entryIdx);
    const roundsToExit = Math.min(maxRounds, c.followOnCounts.filter((n) => tier <= n).length + 1);
    const exitIdx = Math.min(STAGES.length - 1, entryIdx + Math.max(1, roundsToExit));

    companies.push({
      id: `c${i + 1}`,
      name: `Company ${i + 1}`,
      entryRound: c.initialRound,
      entryDateOffsetMonths: offsetMonths,
      initialCheck: c.initialCheckSize,
      followOnChecks,
      exitRound: STAGES[exitIdx],
      exitValuation: 0, // exits default to write-off until the user sets outcomes
      exitYears: undefined,
      entryOwnershipOverride: null,
      dilutionPerRound: 0,
      isCustom: false,
    });
    void inception;
  }
  return companies;
}

export interface StageAllocationRow {
  stage: Stage;
  count: number;
  check: number;
}

function clampRate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function defaultAllocatedOutcome(
  model: FundModel,
  entryStage: Stage,
  cohortIndex: number,
  cohortCount: number
): Pick<Company, "exitRound" | "exitValuation"> {
  const entryIdx = stageIndex(entryStage);
  let surviving = cohortCount;
  let exitIdx = entryIdx;

  for (let i = entryIdx; i < STAGES.length - 1; i++) {
    surviving = Math.round(surviving * clampRate(marketFor(model.market, STAGES[i]).graduationRate));
    if (cohortIndex >= surviving) break;
    exitIdx = i + 1;
  }

  if (exitIdx === entryIdx) {
    return { exitRound: STAGES[Math.min(STAGES.length - 1, entryIdx + 1)], exitValuation: 0 };
  }

  const exitRound = STAGES[exitIdx];
  return { exitRound, exitValuation: marketFor(model.market, exitRound).postMoneyValuation };
}

function refreshGraduationOutcomes(model: FundModel): Company[] {
  const byStage = new Map<Stage, Company[]>();
  for (const company of model.companies) {
    const cohort = byStage.get(company.entryRound) ?? [];
    cohort.push(company);
    byStage.set(company.entryRound, cohort);
  }

  return model.companies.map((company) => {
    if (company.outcomeSource !== "Graduation") return company;
    const cohort = byStage.get(company.entryRound) ?? [company];
    const cohortIndex = cohort.findIndex((c) => c.id === company.id);
    const seededOutcome = defaultAllocatedOutcome(
      model,
      company.entryRound,
      Math.max(0, cohortIndex),
      cohort.length
    );
    return { ...company, ...seededOutcome };
  });
}

/**
 * Semi-custom generation: build a roster from per-stage cohorts (e.g. 10 Pre-Seed,
 * 20 Seed, 10 Series A). Within a cohort everything is uniform (entry stage, check,
 * follow-on tiers, pacing); across cohorts the entry stage varies. Existing rows are
 * overlaid by id so names and dates are preserved, while outcomes are refreshed
 * from the cohort's entry stage graduation rates.
 */
export function generateAllocatedCompanies(
  model: FundModel,
  allocation: StageAllocationRow[],
  existing: Company[]
): Company[] {
  const { construction: c } = model;
  const byId = new Map(existing.map((e) => [e.id, e]));
  const rows = [...allocation].filter((a) => a.count > 0).sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage));

  const companies: Company[] = [];
  let rank = 0;
  for (const row of rows) {
    for (let j = 0; j < row.count; j++) {
      rank += 1;
      const tier = rank; // follow-ons go to earliest-ranked deals first
      const followOnChecks: number[] = c.followOnCounts.map((count, k) => {
        if (tier > count) return 0;
        return c.followOnStrategy === "Fixed Amount" ? c.followOnFixedChecks[k] ?? 0 : -1;
      });
      const offsetMonths = c.initialChecksPerMonth > 0 ? (rank - 1) / c.initialChecksPerMonth : 0;
      const id = `c${rank}`;
      const prev = byId.get(id);
      const keepStageEdits = prev?.entryRound === row.stage;
      const seededOutcome = defaultAllocatedOutcome(model, row.stage, j, row.count);
      companies.push({
        id,
        name: prev?.name ?? `Company ${rank}`,
        entryRound: row.stage,
        entryDateOffsetMonths: offsetMonths,
        entryDate: prev?.entryDate ?? null,
        initialCheck: row.check,
        followOnChecks,
        exitRound: seededOutcome.exitRound,
        exitValuation: seededOutcome.exitValuation,
        exitYears: prev?.exitYears ?? null,
        entryOwnershipOverride: keepStageEdits ? prev.entryOwnershipOverride : null,
        dilutionPerRound: keepStageEdits ? prev.dilutionPerRound : 0,
        isCustom: true,
        outcomeSource: "Graduation",
      });
    }
  }
  return companies;
}

/** Resolve the active company list depending on input mode. */
export function resolveCompanies(model: FundModel): Company[] {
  if (model.construction.inputMode === "Uniform") {
    // Uniform mode regenerates structure but preserves user-set exit outcomes
    // (exit round + valuation) by id so toggling modes doesn't lose them.
    const generated = generateUniformCompanies(model);
    const byId = new Map(model.companies.map((c) => [c.id, c]));
    return generated.map((g) => {
      const prev = byId.get(g.id);
      if (prev) {
        return {
          ...g,
          name: prev.name,
          exitRound: prev.exitRound,
          exitValuation: prev.exitValuation,
          exitYears: prev.exitYears ?? null,
        };
      }
      return g;
    });
  }
  return refreshGraduationOutcomes(model);
}

// ----------------------------------------------------------------------------
// Per-company computation: ownership progression, invested capital, proceeds.
// ----------------------------------------------------------------------------

export function computeCompany(company: Company, model: FundModel): CompanyResult {
  const market = model.market;
  const inception = new Date(model.settings.inceptionDate);
  const entryIdx = stageIndex(company.entryRound);
  const exitIdx = Math.max(entryIdx, stageIndex(company.exitRound));

  const entryMarket = marketFor(market, company.entryRound);

  // Ownership at entry.
  let ownership =
    company.entryOwnershipOverride != null
      ? company.entryOwnershipOverride
      : entryMarket.postMoneyValuation > 0
      ? company.initialCheck / entryMarket.postMoneyValuation
      : 0;
  const ownershipAtEntry = ownership;

  let invested = company.initialCheck;
  const entryDate = company.entryDate
    ? new Date(company.entryDate)
    : addMonths(inception, company.entryDateOffsetMonths);
  const yearsBetween = model.construction.yearsBetweenRounds || 1.5;

  // Progress through each post-entry round up to the exit round.
  const numPostEntryRounds = exitIdx - entryIdx;
  for (let r = 1; r <= numPostEntryRounds; r++) {
    const roundStage = STAGES[entryIdx + r];
    const m = marketFor(market, roundStage);
    if (m.postMoneyValuation <= 0) continue;

    const dilutionFactor =
      company.dilutionPerRound > 0
        ? 1 - company.dilutionPerRound
        : 1 - m.roundSize / m.postMoneyValuation;

    // Follow-on participation for this round (tier r, 1-indexed into followOnChecks).
    const rawCheck = company.followOnChecks[r - 1] ?? 0;
    let investThisRound = 0;
    if (rawCheck === -1) {
      // Pro-rata: invest enough to maintain ownership.
      investThisRound = ownership * m.roundSize;
    } else if (rawCheck > 0) {
      investThisRound = rawCheck;
    }

    // Unified ownership update:
    //   own_after = own_before * (1 - R/P) + investThisRound / P
    ownership = ownership * (m.roundSize / m.postMoneyValuation > 0 ? dilutionFactor : 1) +
      investThisRound / m.postMoneyValuation;
    invested += investThisRound;
  }

  const ownershipAtExit = ownership;
  const proceeds = company.exitValuation > 0 ? ownershipAtExit * company.exitValuation : 0;
  const moic = invested > 0 ? proceeds / invested : 0;

  // Dates.
  const customExitYears =
    typeof company.exitYears === "number" && Number.isFinite(company.exitYears) && company.exitYears > 0
      ? company.exitYears
      : null;
  const lastRoundDate = addYears(entryDate, numPostEntryRounds * yearsBetween);
  // Holding period after last round before realizing (write-offs realize later).
  const holdingYears = company.exitValuation > 0 ? 1.5 : 2.5;
  let exitDate = customExitYears != null ? addYears(entryDate, customExitYears) : addYears(lastRoundDate, holdingYears);
  const fundEnd = addYears(inception, model.settings.fundLifeYears);
  if (exitDate > fundEnd) exitDate = fundEnd;

  return {
    id: company.id,
    name: company.name,
    entryRound: company.entryRound,
    exitRound: company.exitRound,
    entryDate: iso(entryDate),
    exitDate: iso(exitDate),
    ownershipAtEntry,
    ownershipAtExit,
    investedCapital: invested,
    proceeds,
    moic,
    outcome: classifyOutcome(moic),
  };
}

function classifyOutcome(moic: number): CompanyResult["outcome"] {
  if (moic <= 0) return "Write-Off";
  if (moic < 1) return "Below Cost";
  if (moic < 5) return "1-5x";
  if (moic < 10) return "5-10x";
  return ">10x";
}

// ----------------------------------------------------------------------------
// Cash-flow schedule (quarterly) with management fees, expenses, contributions,
// distributions, recycling and the European carry waterfall.
// ----------------------------------------------------------------------------

interface WaterfallState {
  paidIn: number;
  returnedCapital: number;
  prefAccrued: number;
  prefPaidCumulative: number;
  gpCarrySoFar: number;
}

function defaultCapitalCallSchedule(investmentPeriodYears: number): number[] {
  const years = Math.max(1, Math.round(investmentPeriodYears));
  return Array.from({ length: years }, () => 1 / years);
}

function capitalCallSchedule(model: FundModel): number[] {
  const schedule = model.settings.capitalCallSchedule;
  return schedule && schedule.length ? schedule : defaultCapitalCallSchedule(model.settings.investmentPeriodYears);
}

function managementFeePctForQuarter(model: FundModel, quarter: number): number {
  const invPeriodQuarters = model.settings.investmentPeriodYears * 4;
  if (quarter < invPeriodQuarters) return model.fees.managementFeePct;
  const stepDowns = quarter - invPeriodQuarters + 1;
  return Math.max(
    model.fees.managementFeeFloorPct,
    model.fees.managementFeePct - model.fees.stepDownPerQuarter * stepDowns
  );
}

export function computeCashFlows(
  model: FundModel,
  companies: CompanyResult[]
): { periods: CashFlowPeriod[]; totalGPCarry: number } {
  const { settings, fees, waterfall } = model;
  const inception = new Date(settings.inceptionDate);
  const numQuarters = Math.max(1, Math.round(settings.fundLifeYears * 4));
  const fundSize = settings.fundSize;

  // Pre-compute each company's investment events (date + amount) and exit event.
  // Investments: initial at entryDate; follow-ons spaced by yearsBetweenRounds.
  const investEvents: { date: Date; amount: number }[] = [];
  const sourceById = new Map(model.companies.map((c) => [c.id, c]));
  const yearsBetween = model.construction.yearsBetweenRounds || 1.5;
  for (const cr of companies) {
    const src = sourceById.get(cr.id);
    const entryDate = new Date(cr.entryDate);
    investEvents.push({ date: entryDate, amount: src ? src.initialCheck : 0 });
    if (src) {
      const entryIdx = stageIndex(src.entryRound);
      const exitIdx = Math.max(entryIdx, stageIndex(src.exitRound));
      const numPost = exitIdx - entryIdx;
      let own =
        src.entryOwnershipOverride != null
          ? src.entryOwnershipOverride
          : (() => {
              const em = marketFor(model.market, src.entryRound);
              return em.postMoneyValuation > 0 ? src.initialCheck / em.postMoneyValuation : 0;
            })();
      for (let r = 1; r <= numPost; r++) {
        const stage = STAGES[entryIdx + r];
        const m = marketFor(model.market, stage);
        const raw = src.followOnChecks[r - 1] ?? 0;
        let amt = 0;
        if (raw === -1) amt = own * m.roundSize;
        else if (raw > 0) amt = raw;
        if (amt > 0) investEvents.push({ date: addYears(entryDate, r * yearsBetween), amount: amt });
        if (m.postMoneyValuation > 0) {
          const dil = src.dilutionPerRound > 0 ? 1 - src.dilutionPerRound : 1 - m.roundSize / m.postMoneyValuation;
          own = own * dil + amt / m.postMoneyValuation;
        }
      }
    }
  }

  // Exit (distribution) events.
  const exitEvents = companies
    .filter((c) => c.proceeds > 0)
    .map((c) => ({ date: new Date(c.exitDate), amount: c.proceeds }));

  // Helper: which quarter index a date falls into (0-based), or -1 if outside.
  const quarterEnds: Date[] = [];
  for (let q = 0; q < numQuarters; q++) {
    quarterEnds.push(addMonths(inception, (q + 1) * 3));
  }
  function quarterOf(date: Date): number {
    for (let q = 0; q < numQuarters; q++) {
      if (date.getTime() <= quarterEnds[q].getTime()) return q;
    }
    return numQuarters - 1;
  }

  // Bucket investments and distributions by quarter.
  const investByQ = new Array(numQuarters).fill(0);
  const distByQ = new Array(numQuarters).fill(0);
  for (const e of investEvents) if (e.amount > 0) investByQ[quarterOf(e.date)] += e.amount;
  for (const e of exitEvents) distByQ[quarterOf(e.date)] += e.amount;

  // Investment capital calls are scheduled separately from fees/expenses.
  const totalManagementFees = Array.from({ length: numQuarters }, (_, q) =>
    (managementFeePctForQuarter(model, q) / 4) * fundSize
  ).reduce((a, b) => a + b, 0);
  const totalExpenses = (fees.annualExpensesPct / 4) * fundSize * numQuarters;
  const investmentCallBase = Math.max(0, fundSize - totalManagementFees - totalExpenses);
  const scheduledCalls = capitalCallSchedule(model);
  const investmentCallByQ = new Array(numQuarters).fill(0);
  for (let year = 0; year < scheduledCalls.length; year++) {
    const q = year * 4;
    if (q < numQuarters) investmentCallByQ[q] = investmentCallBase * scheduledCalls[year];
  }

  // Recycling budget.
  let recycleBudget = fees.recyclingPct * fundSize;

  const wf: WaterfallState = {
    paidIn: 0,
    returnedCapital: 0,
    prefAccrued: 0,
    prefPaidCumulative: 0,
    gpCarrySoFar: 0,
  };
  const qHurdle = Math.pow(1 + waterfall.hurdleRate, 0.25) - 1;

  const periods: CashFlowPeriod[] = [];
  let cumulativeNet = 0;
  let totalGPCarry = 0;

  for (let q = 0; q < numQuarters; q++) {
    const annualFeePct = managementFeePctForQuarter(model, q);
    const mgmtFee = -(annualFeePct / 4) * fundSize;
    const expenses = -(fees.annualExpensesPct / 4) * fundSize;

    const investments = -investByQ[q];
    const grossDist = distByQ[q];

    // LP capital call = scheduled investment calls + fees + expenses, less any recycled distributions.
    let grossCall = -investmentCallByQ[q] + mgmtFee + expenses; // negative
    let recycled = 0;
    if (recycleBudget > 0 && grossDist > 0 && grossCall < 0) {
      recycled = Math.min(grossDist, -grossCall, recycleBudget);
      recycleBudget -= recycled;
    }
    const lpContribution = grossCall + recycled; // less negative after recycling
    const distAfterRecycle = grossDist - recycled;

    // ----- Waterfall on distributions -----
    // 1. Accrue preferred return on outstanding (unreturned) capital.
    wf.prefAccrued += Math.max(0, wf.paidIn - wf.returnedCapital) * qHurdle;
    // 2. Add this quarter's contribution to paid-in.
    wf.paidIn += -lpContribution; // lpContribution is negative => add positive
    // 3. Distribute.
    let avail = distAfterRecycle;
    let gpThisQ = 0;
    // Tier 1: return of capital
    {
      const x = Math.min(avail, Math.max(0, wf.paidIn - wf.returnedCapital));
      wf.returnedCapital += x;
      avail -= x;
    }
    // Tier 2: preferred return
    {
      const x = Math.min(avail, wf.prefAccrued);
      wf.prefAccrued -= x;
      wf.prefPaidCumulative += x;
      avail -= x;
    }
    // Tier 3: GP catch-up toward carry% of profit (pref + catch-up).
    if (avail > 0 && waterfall.gpCatchupPct > 0 && waterfall.carriedInterestPct < 1) {
      const target =
        (waterfall.carriedInterestPct / (1 - waterfall.carriedInterestPct)) * wf.prefPaidCumulative;
      const owed = Math.max(0, target - wf.gpCarrySoFar);
      if (owed > 0) {
        const xTotal = Math.min(avail, owed / waterfall.gpCatchupPct);
        const gpGets = xTotal * waterfall.gpCatchupPct;
        gpThisQ += gpGets;
        wf.gpCarrySoFar += gpGets;
        avail -= xTotal;
      }
    }
    // Tier 4: carry split
    if (avail > 0) {
      const gp = avail * waterfall.carriedInterestPct;
      gpThisQ += gp;
      wf.gpCarrySoFar += gp;
      avail -= gp; // remainder is LP's
    }

    const gpCarry = gpThisQ;
    totalGPCarry += gpCarry;
    const netDistributions = distAfterRecycle - gpCarry;
    const netCashFlow = lpContribution + netDistributions;
    cumulativeNet += netCashFlow;

    // Interim NAV (unrealized value still held), interpolated per company.
    const qEnd = quarterEnds[q];
    let nav = 0;
    for (const cr of companies) {
      const ed = new Date(cr.entryDate).getTime();
      const xd = new Date(cr.exitDate).getTime();
      const t = qEnd.getTime();
      if (t < ed || t >= xd) continue; // not yet entered, or already realized
      if (cr.proceeds <= 0) {
        // Write-offs ramp down toward 0.
        const frac = (t - ed) / (xd - ed);
        nav += cr.investedCapital * Math.max(0, 1 - frac);
      } else {
        // Geometric ramp from invested cost to exit proceeds.
        const frac = (t - ed) / (xd - ed);
        const start = Math.max(cr.investedCapital, 1);
        nav += start * Math.pow(cr.proceeds / start, frac);
      }
    }

    periods.push({
      index: q,
      label: `Y${Math.floor(q / 4) + 1} Q${(q % 4) + 1}`,
      date: iso(quarterEnds[q]),
      managementFees: mgmtFee,
      expenses,
      contributions: investments,
      grossContributions: lpContribution,
      distributions: distAfterRecycle,
      gpCarry,
      netDistributions,
      netCashFlow,
      cumulativeNetCashFlow: cumulativeNet,
      navRemaining: nav,
    });
  }

  return { periods, totalGPCarry };
}

// ----------------------------------------------------------------------------
// XIRR — internal rate of return for irregularly dated cash flows.
// ----------------------------------------------------------------------------

export function xirr(cashFlows: { date: Date; amount: number }[]): number {
  const flows = cashFlows.filter((c) => c.amount !== 0);
  if (flows.length < 2) return NaN;
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return NaN;

  const t0 = flows[0].date.getTime();
  const years = (d: Date) => (d.getTime() - t0) / (365 * MS_PER_DAY);

  const npv = (rate: number) =>
    flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + rate, years(f.date)), 0);
  const dnpv = (rate: number) =>
    flows.reduce((acc, f) => {
      const t = years(f.date);
      return acc - (t * f.amount) / Math.pow(1 + rate, t + 1);
    }, 0);

  // Newton-Raphson with a bisection fallback for robustness.
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(v) < 1e-6) return rate;
    if (d === 0) break;
    const next = rate - v / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next < -0.9999 ? -0.9999 : next;
  }
  // Bisection over a wide bracket.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (flo * fhi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// ----------------------------------------------------------------------------
// Aggregate metrics.
// ----------------------------------------------------------------------------

function computeMetrics(
  model: FundModel,
  companies: CompanyResult[],
  periods: CashFlowPeriod[],
  totalGPCarry: number
): FundMetrics {
  const fundSize = model.settings.fundSize;
  const totalManagementFees = -periods.reduce((a, p) => a + p.managementFees, 0);
  const totalExpenses = -periods.reduce((a, p) => a + p.expenses, 0);
  const investableCapital = fundSize - totalManagementFees - totalExpenses;
  const maxCapitalWithRecycling = investableCapital + model.fees.recyclingPct * fundSize;

  const totalInvested = companies.reduce((a, c) => a + c.investedCapital, 0);
  const totalProceeds = companies.reduce((a, c) => a + c.proceeds, 0);
  const grossMOIC = totalInvested > 0 ? totalProceeds / totalInvested : 0;

  // LP cash flows for net metrics.
  const inception = new Date(model.settings.inceptionDate);
  const lpFlows: { date: Date; amount: number }[] = periods.map((p) => ({
    date: new Date(p.date),
    amount: p.netCashFlow,
  }));
  const grossFlows: { date: Date; amount: number }[] = [];
  // Gross flows: -investments at their dates, +proceeds at exit dates.
  for (const p of periods) {
    if (p.contributions !== 0) grossFlows.push({ date: new Date(p.date), amount: p.contributions });
    if (p.distributions !== 0) grossFlows.push({ date: new Date(p.date), amount: p.distributions });
  }

  const totalContributionsLP = -periods.reduce((a, p) => a + Math.min(0, p.grossContributions), 0);
  const totalDistributionsLP = periods.reduce((a, p) => a + p.netDistributions, 0);
  const finalNav = periods.length ? periods[periods.length - 1].navRemaining : 0;

  const netDPI = totalContributionsLP > 0 ? totalDistributionsLP / totalContributionsLP : 0;
  const netRVPI = totalContributionsLP > 0 ? finalNav / totalContributionsLP : 0;
  const netTVPI = netDPI + netRVPI;
  const netIRR = xirr(lpFlows);
  const grossIRR = xirr(grossFlows);

  // Outcome distribution.
  const numCompanies = companies.length;
  const lossCount = companies.filter((c) => c.outcome === "Write-Off").length;
  const belowCostCount = companies.filter((c) => c.outcome === "Below Cost").length;
  const baseHit1to5Count = companies.filter((c) => c.outcome === "1-5x").length;
  const baseHit5to10Count = companies.filter((c) => c.outcome === "5-10x").length;
  const successCount = companies.filter((c) => c.outcome === ">10x").length;
  const lossDollar = companies.filter((c) => c.outcome === "Write-Off").reduce((a, c) => a + c.investedCapital, 0);

  // Sensitivity: gross MOIC excluding top N proceeds-generating companies.
  const sorted = [...companies].sort((a, b) => b.proceeds - a.proceeds);
  const exTop = (n: number) => {
    const excluded = sorted.slice(0, n);
    const exProceeds = totalProceeds - excluded.reduce((a, c) => a + c.proceeds, 0);
    const exInvested = totalInvested - excluded.reduce((a, c) => a + c.investedCapital, 0);
    return exInvested > 0 ? exProceeds / exInvested : 0;
  };

  return {
    fundSize,
    totalManagementFees,
    totalExpenses,
    investableCapital,
    totalInvested,
    pctDeployed: investableCapital > 0 ? totalInvested / investableCapital : 0,
    maxCapitalWithRecycling,
    totalProceeds,
    grossMOIC,
    grossIRR,
    totalContributionsLP,
    totalDistributionsLP,
    netMOIC: totalContributionsLP > 0 ? totalDistributionsLP / totalContributionsLP : 0,
    netTVPI,
    netDPI,
    netRVPI,
    netIRR,
    totalGPCarry,
    numCompanies,
    lossCount,
    lossRatioCount: numCompanies > 0 ? lossCount / numCompanies : 0,
    lossRatioDollar: totalInvested > 0 ? lossDollar / totalInvested : 0,
    belowCostCount,
    baseHit1to5Count,
    baseHit5to10Count,
    successCount,
    grossMOICExTop1: exTop(1),
    grossMOICExTop2: exTop(2),
    grossMOICExTop3: exTop(3),
  };
}

function computeAnnual(periods: CashFlowPeriod[]): AnnualCashFlow[] {
  const byYear = new Map<number, AnnualCashFlow>();
  for (const p of periods) {
    const year = Math.floor(p.index / 4) + 1;
    const entry =
      byYear.get(year) ??
      { year, capitalCalls: 0, distributions: 0, netCashFlow: 0, cumulativeNetCashFlow: 0 };
    entry.capitalCalls += p.grossContributions;
    entry.distributions += p.netDistributions;
    entry.netCashFlow += p.netCashFlow;
    byYear.set(year, entry);
  }
  const arr = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  let cum = 0;
  for (const a of arr) {
    cum += a.netCashFlow;
    a.cumulativeNetCashFlow = cum;
  }
  return arr;
}

function computeStageExposure(model: FundModel, companies: CompanyResult[]): StageExposure[] {
  const totalInvested = companies.reduce((a, c) => a + c.investedCapital, 0);
  const map = new Map<Stage, StageExposure>();
  for (const s of STAGES) {
    map.set(s, { stage: s, numEntries: 0, capitalDeployed: 0, pctOfInvested: 0 });
  }
  // Entries counted by entry round; capital attributed to entry round (simple view).
  for (const c of companies) {
    const e = map.get(c.entryRound)!;
    e.numEntries += 1;
    e.capitalDeployed += c.investedCapital;
  }
  for (const e of map.values()) {
    e.pctOfInvested = totalInvested > 0 ? e.capitalDeployed / totalInvested : 0;
  }
  return Array.from(map.values()).filter((e) => e.numEntries > 0 || e.capitalDeployed > 0);
}

// ----------------------------------------------------------------------------
// Orchestrator.
// ----------------------------------------------------------------------------

export function computeModel(model: FundModel): ComputedModel {
  const companySources = resolveCompanies(model);
  // Build a resolved model so the cash-flow engine sees the active companies.
  const resolvedModel: FundModel = { ...model, companies: companySources };
  const companies = companySources.map((c) => computeCompany(c, resolvedModel));
  const { periods, totalGPCarry } = computeCashFlows(resolvedModel, companies);
  const metrics = computeMetrics(resolvedModel, companies, periods, totalGPCarry);
  const annualCashFlows = computeAnnual(periods);
  const stageExposure = computeStageExposure(resolvedModel, companies);
  return { metrics, companies, cashFlows: periods, annualCashFlows, stageExposure };
}
