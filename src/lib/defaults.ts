// Default fund model, seeded from the "3iP Fund II — 50 Companies" model and
// the SVB construction template. Used to populate a fresh scenario so the app
// opens with a realistic, fully-worked example.

import { FundModel, Company, Stage, MarketAssumption, STAGES } from "./types";

export const DEFAULT_MARKET: MarketAssumption[] = [
  { stage: "Pre-Seed", roundSize: 1_000_000, postMoneyValuation: 5_000_000, graduationRate: 0.55 },
  { stage: "Seed", roundSize: 2_000_000, postMoneyValuation: 10_000_000, graduationRate: 0.5 },
  { stage: "Series A", roundSize: 5_000_000, postMoneyValuation: 25_000_000, graduationRate: 0.45 },
  { stage: "Series B", roundSize: 10_000_000, postMoneyValuation: 50_000_000, graduationRate: 0.5 },
  { stage: "Series C", roundSize: 40_000_000, postMoneyValuation: 200_000_000, graduationRate: 0.55 },
  { stage: "Series D", roundSize: 100_000_000, postMoneyValuation: 500_000_000, graduationRate: 0.6 },
  { stage: "Series E", roundSize: 200_000_000, postMoneyValuation: 1_000_000_000, graduationRate: 0.6 },
  { stage: "Series F", roundSize: 200_000_000, postMoneyValuation: 2_300_000_000, graduationRate: 0.6 },
  { stage: "Series G", roundSize: 275_000_000, postMoneyValuation: 3_000_000_000, graduationRate: 0.6 },
];

interface OutcomeSpec {
  count: number;
  exitRound: Stage;
  // exit valuations cycled across the companies in this band
  valuations: number[];
}

// Outcome bands roughly matching the 3iP portfolio ratio:
// 4 winners (>10x), 5 strong (5-10x), 12 base hits (1-5x), 29 write-offs.
const OUTCOME_BANDS: OutcomeSpec[] = [
  { count: 4, exitRound: "Series E", valuations: [1_000_000_000, 600_000_000, 500_000_000, 250_000_000] },
  { count: 5, exitRound: "Series C", valuations: [200_000_000, 175_000_000, 150_000_000, 120_000_000, 90_000_000] },
  {
    count: 12,
    exitRound: "Series B",
    valuations: [60_000_000, 55_000_000, 50_000_000, 45_000_000, 42_000_000, 40_000_000, 38_000_000, 35_000_000, 32_000_000, 28_000_000, 24_000_000, 20_000_000],
  },
  { count: 29, exitRound: "Series A", valuations: [0] },
];

export function buildDefaultCompanies(numDeals: number, initialRound: Stage): Company[] {
  const companies: Company[] = [];
  // Flatten outcome bands into a per-company assignment list.
  const assignments: { exitRound: Stage; exitValuation: number }[] = [];
  for (const band of OUTCOME_BANDS) {
    for (let i = 0; i < band.count; i++) {
      assignments.push({
        exitRound: band.exitRound,
        exitValuation: band.valuations[i % band.valuations.length],
      });
    }
  }

  const entryIdx = STAGES.indexOf(initialRound);
  for (let i = 0; i < numDeals; i++) {
    const a = assignments[i] ?? { exitRound: STAGES[Math.min(STAGES.length - 1, entryIdx + 1)], exitValuation: 0 };
    // Ensure exit round is not before entry round.
    const exitIdx = Math.max(entryIdx + 1, STAGES.indexOf(a.exitRound));
    companies.push({
      id: `c${i + 1}`,
      name: `Company ${i + 1}`,
      entryRound: initialRound,
      entryDateOffsetMonths: i, // resolved by engine in uniform mode
      entryDate: null,
      initialCheck: 200_000,
      followOnChecks: [],
      exitRound: STAGES[Math.min(STAGES.length - 1, exitIdx)],
      exitValuation: a.exitValuation,
      exitYears: null,
      entryOwnershipOverride: null,
      dilutionPerRound: 0,
      isCustom: false,
    });
  }
  return companies;
}

export function buildDefaultModel(): FundModel {
  const numDeals = 50;
  const initialRound: Stage = "Pre-Seed";
  return {
    settings: {
      fundSize: 25_000_000,
      inceptionDate: "2024-01-01",
      fundLifeYears: 12,
      investmentPeriodYears: 5,
      capitalCallSchedule: [0.2, 0.2, 0.2, 0.2, 0.2],
    },
    fees: {
      managementFeePct: 0.02,
      stepDownPerQuarter: 0.00125,
      managementFeeFloorPct: 0.01,
      annualExpensesPct: 0.002,
      recyclingPct: 0.1,
    },
    waterfall: {
      hurdleRate: 0.07,
      carriedInterestPct: 0.2,
      gpCatchupPct: 1.0,
    },
    construction: {
      inputMode: "Uniform",
      numDeals,
      initialCheckSize: 200_000,
      initialRound,
      followOnCounts: [20, 10, 5, 0],
      followOnStrategy: "Pro-Rata",
      followOnFixedChecks: [500_000, 1_000_000, 2_000_000, 3_000_000],
      initialChecksPerMonth: 1,
      yearsBetweenRounds: 1.5,
      reservePct: 0.25,
    },
    market: DEFAULT_MARKET,
    companies: buildDefaultCompanies(numDeals, initialRound),
  };
}
