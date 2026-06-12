import {
  FundModel,
  ComputedModel,
  FundSettings,
  FeeStructure,
  Waterfall,
  ConstructionStrategy,
  Company,
  Stage,
  MarketAssumption,
} from "@/lib/types";

/** Shared editing context handed to every section component. */
export interface FundCtx {
  model: FundModel;
  computed: ComputedModel;
  patchSettings: (p: Partial<FundSettings>) => void;
  patchFees: (p: Partial<FeeStructure>) => void;
  patchWaterfall: (p: Partial<Waterfall>) => void;
  patchConstruction: (p: Partial<ConstructionStrategy>) => void;
  setMarketRow: (stage: Stage, p: Partial<MarketAssumption>) => void;
  patchCompany: (id: string, p: Partial<Company>) => void;
  setCompanies: (cs: Company[]) => void;
  /** Rebuild the company list from the current Uniform strategy (loses custom rows). */
  regenerateCompanies: () => void;
}
