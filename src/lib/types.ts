// ============================================================================
// Domain types for the VC Fund Portfolio Construction model.
// Mirrors the concepts in the 3iP Fund II model and the SVB construction
// template: fund setup, fees & waterfall, construction strategy, market
// assumptions (round sizes / valuations per stage), a per-company schedule of
// investments, and the derived cash-flow / returns engine.
// ============================================================================

export const STAGES = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E",
  "Series F",
  "Series G",
] as const;

export type Stage = (typeof STAGES)[number];

export type FollowOnStrategy = "Pro-Rata" | "Fixed Amount";
export type InputMode = "Uniform" | "Custom";

/** Average round size + post-money valuation for each financing stage. */
export interface MarketAssumption {
  stage: Stage;
  roundSize: number; // total $ raised in the round
  postMoneyValuation: number; // post-money $ valuation
  /** % of companies that graduate from this stage to the next (0..1). */
  graduationRate: number;
}

/** Construction strategy — how the fund deploys initial + follow-on capital. */
export interface ConstructionStrategy {
  inputMode: InputMode;
  numDeals: number; // expected number of initial checks / investments
  initialCheckSize: number; // $ per initial check (uniform mode)
  initialRound: Stage; // entry stage for initial checks
  /** How many deals receive each follow-on tranche (tier 1..4). */
  followOnCounts: [number, number, number, number];
  followOnStrategy: FollowOnStrategy;
  /** Fixed follow-on check sizes (used when strategy = "Fixed Amount"), per tier. */
  followOnFixedChecks: [number, number, number, number];
  initialChecksPerMonth: number; // pacing of initial checks
  yearsBetweenRounds: number; // spacing between follow-on rounds
  reservePct: number; // % of fund reserved for follow-ons (informational)
}

export interface FeeStructure {
  managementFeePct: number; // annual mgmt fee (% of committed), e.g. 0.02
  stepDownPerQuarter: number; // reduction per qtr after investment period
  managementFeeFloorPct: number; // floor for mgmt fee
  annualExpensesPct: number; // annual fund expenses (% of fund size)
  recyclingPct: number; // % of fund size allowed to be recycled
}

/** European waterfall parameters. */
export interface Waterfall {
  hurdleRate: number; // preferred return (annual IRR), e.g. 0.07
  carriedInterestPct: number; // GP carry, e.g. 0.20
  gpCatchupPct: number; // catch-up rate, e.g. 1.0 (100%) or 0.5
}

export interface FundSettings {
  fundSize: number;
  inceptionDate: string; // ISO yyyy-mm-dd
  fundLifeYears: number;
  investmentPeriodYears: number;
  /** Annual % of investable capital called for investments; fees/expenses are separate. */
  capitalCallSchedule?: number[];
}

/**
 * A single portfolio company. In Uniform mode most of these fields are derived
 * by the engine; in Custom mode the user can override any of them. Persisted
 * rows always store the resolved (possibly overridden) values.
 */
export interface Company {
  id: string;
  name: string;
  entryRound: Stage;
  entryDateOffsetMonths: number; // months after inception when initial check is made
  /** Absolute entry date (ISO yyyy-mm-dd). When set (Custom mode), overrides the
   * offset-based date so the user can place the investment on a specific date. */
  entryDate?: string | null;
  initialCheck: number; // $ invested at entry
  /** Per-tier follow-on investments (aligned to rounds after entry). */
  followOnChecks: number[];
  exitRound: Stage; // round after which the company exits
  exitValuation: number; // $ exit (acquisition / IPO) valuation; 0 = full write-off
  /** Years from entry date to exit/distribution. When set, overrides stage-derived timing. */
  exitYears?: number | null;
  /** Optional explicit ownership override at entry (0..1). If null, derived. */
  entryOwnershipOverride: number | null;
  /** Average dilution per subsequent round if not following on pro-rata (0..1). */
  dilutionPerRound: number;
  isCustom: boolean; // true if the row has user overrides
  outcomeSource?: "Graduation" | "Manual";
}

/** The full model — everything needed to compute the fund. */
export interface FundModel {
  settings: FundSettings;
  fees: FeeStructure;
  waterfall: Waterfall;
  construction: ConstructionStrategy;
  market: MarketAssumption[];
  companies: Company[];
}

/** A saved scenario / fund record (DB row, with model JSON inside). */
export interface ScenarioRecord {
  id: number;
  name: string;
  description: string;
  model: FundModel;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Computed / output types
// ----------------------------------------------------------------------------

export interface CompanyResult {
  id: string;
  name: string;
  entryRound: Stage;
  exitRound: Stage;
  entryDate: string;
  exitDate: string;
  ownershipAtEntry: number;
  ownershipAtExit: number;
  investedCapital: number;
  proceeds: number;
  moic: number;
  outcome: "Write-Off" | "Below Cost" | "1-5x" | "5-10x" | ">10x";
}

export interface CashFlowPeriod {
  index: number; // quarter index (0-based)
  label: string; // e.g. "Y1 Q2"
  date: string; // ISO end-of-quarter date
  managementFees: number; // negative
  expenses: number; // negative
  contributions: number; // negative (capital invested into companies)
  grossContributions: number; // negative (incl. fees+expenses+investments) for LP calls
  distributions: number; // positive (gross exit proceeds)
  gpCarry: number; // positive (carry paid to GP) — reduces LP distributions
  netDistributions: number; // distributions - gpCarry
  netCashFlow: number; // LP net cash flow this period
  cumulativeNetCashFlow: number;
  navRemaining: number; // residual value still held (unrealized)
}

export interface FundMetrics {
  // Capital
  fundSize: number;
  totalManagementFees: number;
  totalExpenses: number;
  investableCapital: number;
  totalInvested: number;
  pctDeployed: number;
  maxCapitalWithRecycling: number;
  // Returns (gross)
  totalProceeds: number;
  grossMOIC: number;
  grossIRR: number;
  // Returns (net of fees + carry)
  totalContributionsLP: number; // total paid-in by LPs (calls)
  totalDistributionsLP: number; // total distributed to LPs
  netMOIC: number; // = TVPI when no residual NAV; here DPI-like on realized
  netTVPI: number;
  netDPI: number;
  netRVPI: number;
  netIRR: number;
  totalGPCarry: number;
  // Outcome distribution
  numCompanies: number;
  lossCount: number; // full write-offs
  lossRatioCount: number; // # / total
  lossRatioDollar: number; // $ written off / invested
  belowCostCount: number;
  baseHit1to5Count: number;
  baseHit5to10Count: number;
  successCount: number; // >10x
  // Sensitivity: gross MOIC excluding the top N performers
  grossMOICExTop1: number;
  grossMOICExTop2: number;
  grossMOICExTop3: number;
}

export interface ComputedModel {
  metrics: FundMetrics;
  companies: CompanyResult[];
  cashFlows: CashFlowPeriod[];
  annualCashFlows: AnnualCashFlow[];
  stageExposure: StageExposure[];
}

export interface AnnualCashFlow {
  year: number;
  capitalCalls: number; // negative
  distributions: number; // positive
  netCashFlow: number;
  cumulativeNetCashFlow: number;
}

export interface StageExposure {
  stage: Stage;
  numEntries: number; // companies entering at this stage
  capitalDeployed: number; // $ deployed at this stage (initial + follow-on)
  pctOfInvested: number;
}
