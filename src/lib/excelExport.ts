import { Buffer } from "node:buffer";
import { computeModel, resolveCompanies } from "./engine";
import {
  CashFlowPeriod,
  Company,
  CompanyResult,
  FundModel,
} from "./types";

export const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type StyleId =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

type CellValue = string | number | boolean | Date | null;

interface Cell {
  value?: CellValue;
  formula?: string;
  style?: StyleId;
}

interface ColumnSpec {
  min: number;
  max: number;
  width: number;
}

interface SheetSpec {
  name: string;
  rows: Cell[][];
  merges?: string[];
  columns?: ColumnSpec[];
  freezeTopRows?: number;
}

const S = {
  normal: 0 as StyleId,
  title: 1 as StyleId,
  section: 2 as StyleId,
  label: 3 as StyleId,
  inputText: 4 as StyleId,
  inputCurrency: 5 as StyleId,
  inputPercent: 6 as StyleId,
  currency: 7 as StyleId,
  percent: 8 as StyleId,
  multiple: 9 as StyleId,
  date: 10 as StyleId,
  formulaCurrency: 11 as StyleId,
  formulaPercent: 12 as StyleId,
  formulaMultiple: 13 as StyleId,
  header: 14 as StyleId,
  totalCurrency: 15 as StyleId,
  totalPercent: 16 as StyleId,
  totalMultiple: 17 as StyleId,
  number: 18 as StyleId,
  formulaNumber: 19 as StyleId,
  wrapped: 20 as StyleId,
};

function cell(value: CellValue, style: StyleId = S.normal): Cell {
  return { value, style };
}

function formula(formulaText: string, cachedValue: CellValue, style: StyleId = S.normal): Cell {
  return { formula: formulaText.replace(/^=/, ""), value: cachedValue, style };
}

function blank(style?: StyleId): Cell {
  return style == null ? {} : { style };
}

function row(maxCol: number, entries: Array<[number, Cell]>): Cell[] {
  const cells = Array.from({ length: maxCol }, () => blank());
  for (const [col, value] of entries) cells[col - 1] = value;
  return cells;
}

function safeFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "portfolio-construction"}-svb-model.xlsx`;
}

export function excelFileName(name: string): string {
  return safeFileName(name);
}

export function buildScenarioWorkbook(name: string, model: FundModel): Buffer {
  const computed = computeModel(model);
  const resolvedCompanies = resolveCompanies(model);
  const sourceById = new Map(resolvedCompanies.map((company) => [company.id, company]));

  const sheets: SheetSpec[] = [
    buildInstructionsSheet(name),
    buildModelSheet(name, model, resolvedCompanies, computed.companies),
    buildCashFlowsSheet(computed.cashFlows, model.settings.fundSize),
  ];

  return createXlsx(sheets);
}

function buildInstructionsSheet(name: string): SheetSpec {
  const maxCol = 8;
  const rows: Cell[][] = [
    row(maxCol, []),
    row(maxCol, []),
    row(maxCol, [[2, cell("Instructions & Assumptions", S.title)]]),
    row(maxCol, []),
    row(maxCol, [
      [
        2,
        cell(
          `This workbook exports ${name} in an SVB-style venture portfolio construction format.`,
          S.wrapped
        ),
      ],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Workbook Structure", S.section)]]),
    row(maxCol, [
      [2, cell("1.", S.label)],
      [3, cell("Model tab contains fund inputs, fund-level metrics, exit inputs, and the schedule of investments.", S.wrapped)],
    ]),
    row(maxCol, [
      [2, cell("2.", S.label)],
      [3, cell("Cash Flows tab shows quarterly fees, investment calls, distributions, carry, net cash flow, and NAV.", S.wrapped)],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Color Convention", S.section)]]),
    row(maxCol, [
      [2, cell("Blue / yellow", S.inputText)],
      [3, cell("User-controlled inputs exported from the app.", S.wrapped)],
    ]),
    row(maxCol, [
      [2, cell("Green", S.formulaNumber)],
      [3, cell("Formula links or calculated outputs inside the workbook.", S.wrapped)],
    ]),
    row(maxCol, [
      [2, cell("Dark header", S.section)],
      [3, cell("Major model sections, matching the construction model layout.", S.wrapped)],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Notes", S.section)]]),
    row(maxCol, [
      [
        2,
        cell(
          "The export is generated from the current app scenario. It does not include SVB macros; formulas and values are provided in a standard .xlsx file.",
          S.wrapped
        ),
      ],
    ]),
  ];

  return {
    name: "Instructions",
    rows,
    merges: ["B3:H3", "B7:H7", "B11:H11", "B16:H16"],
    columns: [
      { min: 1, max: 1, width: 3 },
      { min: 2, max: 2, width: 18 },
      { min: 3, max: 8, width: 18 },
    ],
  };
}

function buildModelSheet(
  name: string,
  model: FundModel,
  sources: Company[],
  companies: CompanyResult[]
): SheetSpec {
  const maxCol = 29;
  const rows: Cell[][] = [
    row(maxCol, []),
    row(maxCol, [[2, cell(`${name} - VC Portfolio Construction Model`, S.title)]]),
    row(maxCol, [
      [2, cell("Inputs", S.section)],
      [7, cell("Fund-Level Metrics", S.section)],
      [11, cell("Exit Inputs", S.section)],
      [15, cell("Schedule of Investments", S.section)],
    ]),
    row(maxCol, [
      [2, cell("Model Setup", S.header)],
      [7, cell("Capital Deployment", S.header)],
      [11, cell("Company Name", S.header)],
      [12, cell("Exit Valuation", S.header)],
      [13, cell("Exit Round (After)", S.header)],
      [14, cell("Outcome", S.header)],
      [15, cell("Company Name", S.header)],
      [16, cell("Entry Round", S.header)],
      [17, cell("Initial Check", S.header)],
      [18, cell("Follow-On 1", S.header)],
      [19, cell("Follow-On 2", S.header)],
      [20, cell("Follow-On 3", S.header)],
      [21, cell("Follow-On 4", S.header)],
      [22, cell("Ownership at Entry", S.header)],
      [23, cell("Ownership at Exit", S.header)],
      [24, cell("Entry Date", S.header)],
      [25, cell("Exit Date", S.header)],
      [26, cell("Total Invested Capital", S.header)],
      [27, cell("Total Proceeds", S.header)],
      [28, cell("Gross MOIC", S.header)],
      [29, cell("Years to Exit", S.header)],
    ]),
  ];

  const companyStartRow = 6;
  const companyEndRow = companyStartRow + Math.max(companies.length, 1) - 1;

  rows.push(
    row(maxCol, [
      [2, cell("Mode Selection", S.label)],
      [5, cell(model.construction.inputMode === "Uniform" ? "Uniform Inputs" : "Custom Inputs", S.inputText)],
      [7, cell("Total Commitments", S.label)],
      [9, cell(model.settings.fundSize, S.inputCurrency)],
      [11, cell("TOTAL", S.label)],
      [15, cell("TOTAL", S.label)],
      [26, formula(`SUM(Z${companyStartRow}:Z${companyEndRow})`, sum(companies.map((c) => c.investedCapital)), S.totalCurrency)],
      [27, formula(`SUM(AA${companyStartRow}:AA${companyEndRow})`, sum(companies.map((c) => c.proceeds)), S.totalCurrency)],
      [
        28,
        formula(
          `IFERROR(AA5/Z5,0)`,
          ratio(sum(companies.map((c) => c.proceeds)), sum(companies.map((c) => c.investedCapital))),
          S.totalMultiple
        ),
      ],
    ])
  );

  const inputRows = buildInputRows(model, companies, sources, maxCol);
  const companyRows = buildCompanyRows(sources, companies, maxCol, companyStartRow);
  const totalRows = Math.max(inputRows.length, companyRows.length);
  for (let i = 0; i < totalRows; i++) {
    const inputRow = inputRows[i] ?? row(maxCol, []);
    const companyRow = companyRows[i] ?? row(maxCol, []);
    rows.push(mergeRows(maxCol, inputRow, companyRow));
  }

  return {
    name: "Model",
    rows,
    merges: ["B2:AC2", "B3:E3", "G3:I3", "K3:N3", "O3:AC3"],
    freezeTopRows: 5,
    columns: [
      { min: 1, max: 1, width: 3 },
      { min: 2, max: 2, width: 28 },
      { min: 3, max: 5, width: 16 },
      { min: 7, max: 7, width: 30 },
      { min: 8, max: 9, width: 16 },
      { min: 11, max: 11, width: 20 },
      { min: 12, max: 14, width: 16 },
      { min: 15, max: 15, width: 22 },
      { min: 16, max: 16, width: 14 },
      { min: 17, max: 21, width: 14 },
      { min: 22, max: 23, width: 14 },
      { min: 24, max: 25, width: 13 },
      { min: 26, max: 27, width: 16 },
      { min: 28, max: 28, width: 12 },
      { min: 29, max: 29, width: 12 },
    ],
  };
}

function buildInputRows(
  model: FundModel,
  companies: CompanyResult[],
  sources: Company[],
  maxCol: number
): Cell[][] {
  const metrics = computeModel(model).metrics;
  const schedule = model.settings.capitalCallSchedule ?? [];
  const firstRow = 6;
  const rows: Cell[][] = [
    row(maxCol, [
      [7, cell("Maximum Capital to Invest (Incl. Recycling)", S.label)],
      [9, cell(metrics.maxCapitalWithRecycling, S.formulaCurrency)],
    ]),
    row(maxCol, [
      [7, cell("Total Invested Capital", S.label)],
      [9, formula("Z5", metrics.totalInvested, S.formulaCurrency)],
    ]),
    row(maxCol, [
      [2, cell("Fund Characteristics", S.section)],
      [7, cell("Remaining Investable Capacity", S.label)],
      [9, formula("I6-I7", metrics.maxCapitalWithRecycling - metrics.totalInvested, S.formulaCurrency)],
    ]),
    row(maxCol, [
      [2, cell("Fund Size", S.label)],
      [5, cell(model.settings.fundSize, S.inputCurrency)],
      [7, cell("Gross MOIC", S.label)],
      [9, formula("AB5", metrics.grossMOIC, S.formulaMultiple)],
    ]),
    row(maxCol, [
      [2, cell("Inception Date", S.label)],
      [5, cell(dateValue(model.settings.inceptionDate), S.date)],
      [7, cell("Gross IRR", S.label)],
      [9, cellNumber(metrics.grossIRR, S.formulaPercent)],
    ]),
    row(maxCol, [
      [2, cell("Fund Life (Years)", S.label)],
      [5, cell(model.settings.fundLifeYears, S.inputText)],
      [7, cell("Net IRR", S.label)],
      [9, cellNumber(metrics.netIRR, S.formulaPercent)],
    ]),
    row(maxCol, [
      [2, cell("Investment Period (Years)", S.label)],
      [5, cell(model.settings.investmentPeriodYears, S.inputText)],
      [7, cell("Net TVPI", S.label)],
      [9, cell(metrics.netTVPI, S.formulaMultiple)],
    ]),
    row(maxCol, [
      [2, cell("Investable Capital", S.label)],
      [5, cell(metrics.investableCapital, S.formulaCurrency)],
      [7, cell("Net DPI", S.label)],
      [9, cell(metrics.netDPI, S.formulaMultiple)],
    ]),
    row(maxCol, [
      [2, cell("Total Management Fees", S.label)],
      [5, cell(metrics.totalManagementFees, S.currency)],
      [7, cell("Net RVPI", S.label)],
      [9, cell(metrics.netRVPI, S.formulaMultiple)],
    ]),
    row(maxCol, [
      [2, cell("Total Expenses", S.label)],
      [5, cell(metrics.totalExpenses, S.currency)],
      [7, cell("Total GP Carry", S.label)],
      [9, cell(metrics.totalGPCarry, S.formulaCurrency)],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Capital Call Schedule", S.section)]]),
  ];

  const callSchedule = schedule.length
    ? schedule
    : Array.from({ length: Math.max(1, Math.round(model.settings.investmentPeriodYears)) }, () => 1 / Math.max(1, Math.round(model.settings.investmentPeriodYears)));

  callSchedule.forEach((pct, idx) => {
    rows.push(
      row(maxCol, [
        [2, cell(`Year ${idx + 1} Investment Call`, S.label)],
        [5, cell(pct, S.inputPercent)],
      ])
    );
  });

  rows.push(
    row(maxCol, []),
    row(maxCol, [[2, cell("Construction Strategy", S.section)]]),
    row(maxCol, [
      [2, cell("Expected # of Deals", S.label)],
      [5, cell(model.construction.numDeals, S.inputText)],
    ]),
    row(maxCol, [
      [2, cell("Initial Check Size", S.label)],
      [5, cell(model.construction.initialCheckSize, S.inputCurrency)],
    ]),
    row(maxCol, [
      [2, cell("Initial Round", S.label)],
      [5, cell(model.construction.initialRound, S.inputText)],
    ]),
    row(maxCol, [
      [2, cell("Follow-On Strategy", S.label)],
      [5, cell(model.construction.followOnStrategy, S.inputText)],
    ]),
    ...model.construction.followOnCounts.map((count, idx) =>
      row(maxCol, [
        [2, cell(`Deals Receiving Follow-On ${idx + 1}`, S.label)],
        [5, cell(count, S.inputText)],
      ])
    ),
    row(maxCol, [
      [2, cell("Years Between Rounds", S.label)],
      [5, cell(model.construction.yearsBetweenRounds, S.inputText)],
    ]),
    row(maxCol, [
      [2, cell("Recycling % of Fund", S.label)],
      [5, cell(model.fees.recyclingPct, S.inputPercent)],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Fees & Waterfall", S.section)]]),
    row(maxCol, [
      [2, cell("Management Fee %", S.label)],
      [5, cell(model.fees.managementFeePct, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("Step-Down Per Quarter", S.label)],
      [5, cell(model.fees.stepDownPerQuarter, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("Management Fee Floor %", S.label)],
      [5, cell(model.fees.managementFeeFloorPct, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("Annual Expenses %", S.label)],
      [5, cell(model.fees.annualExpensesPct, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("Hurdle Rate", S.label)],
      [5, cell(model.waterfall.hurdleRate, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("Carried Interest", S.label)],
      [5, cell(model.waterfall.carriedInterestPct, S.inputPercent)],
    ]),
    row(maxCol, [
      [2, cell("GP Catch-Up", S.label)],
      [5, cell(model.waterfall.gpCatchupPct, S.inputPercent)],
    ]),
    row(maxCol, []),
    row(maxCol, [[2, cell("Market Assumptions", S.section)]]),
    row(maxCol, [
      [2, cell("Stage", S.header)],
      [3, cell("Round Size", S.header)],
      [4, cell("Post-Money Valuation", S.header)],
      [5, cell("Graduation Rate", S.header)],
    ]),
    ...model.market.map((market) =>
      row(maxCol, [
        [2, cell(market.stage, S.label)],
        [3, cell(market.roundSize, S.inputCurrency)],
        [4, cell(market.postMoneyValuation, S.inputCurrency)],
        [5, cell(market.graduationRate, S.inputPercent)],
      ])
    )
  );

  // Pad the left-side model to at least the visible company schedule height.
  while (rows.length < Math.max(sources.length, companies.length)) rows.push(row(maxCol, []));
  void firstRow;
  return rows;
}

function buildCompanyRows(
  sources: Company[],
  companies: CompanyResult[],
  maxCol: number,
  startRow: number
): Cell[][] {
  return companies.map((company, index) => {
    const source = sources.find((c) => c.id === company.id);
    const rowNum = startRow + index;
    const followOns = source?.followOnChecks ?? [];
    return row(maxCol, [
      [11, cell(company.name, S.inputText)],
      [12, cell(source?.exitValuation ?? ratio(company.proceeds, company.ownershipAtExit), S.inputCurrency)],
      [13, cell(company.exitRound, S.inputText)],
      [14, cell(company.outcome, S.normal)],
      [15, cell(company.name, S.normal)],
      [16, cell(company.entryRound, S.inputText)],
      [17, cell(source?.initialCheck ?? company.investedCapital, S.inputCurrency)],
      [18, followOnCell(followOns[0])],
      [19, followOnCell(followOns[1])],
      [20, followOnCell(followOns[2])],
      [21, followOnCell(followOns[3])],
      [22, cell(company.ownershipAtEntry, S.percent)],
      [23, cell(company.ownershipAtExit, S.percent)],
      [24, cell(dateValue(company.entryDate), S.date)],
      [25, cell(dateValue(company.exitDate), S.date)],
      [26, cell(company.investedCapital, S.currency)],
      [27, formula(`IFERROR(W${rowNum}*L${rowNum},0)`, company.proceeds, S.formulaCurrency)],
      [28, formula(`IFERROR(AA${rowNum}/Z${rowNum},0)`, company.moic, S.formulaMultiple)],
      [29, cell(source?.exitYears ?? yearsBetween(company.entryDate, company.exitDate), S.number)],
    ]);
  });
}

function followOnCell(value: number | undefined): Cell {
  if (value == null || value === 0) return cell(0, S.currency);
  if (value === -1) return cell("Pro-Rata", S.inputText);
  return cell(value, S.inputCurrency);
}

function buildCashFlowsSheet(periods: CashFlowPeriod[], fundSize: number): SheetSpec {
  const maxCol = Math.max(3 + periods.length, 12);
  const rows: Cell[][] = [
    row(maxCol, []),
    row(maxCol, [[2, cell("Cash Flows", S.title)]]),
    buildCashFlowHeaderRow(maxCol, periods, "year"),
    buildCashFlowHeaderRow(maxCol, periods, "label"),
    buildCashFlowHeaderRow(maxCol, periods, "date"),
    cashFlowMetricRow(maxCol, periods, "Management Fee (%)", (p) => ratio(-p.managementFees * 4, fundSize), S.percent),
    cashFlowMetricRow(maxCol, periods, "Management Fees", (p) => p.managementFees, S.currency),
    cashFlowMetricRow(maxCol, periods, "Fund Expenses", (p) => p.expenses, S.currency),
    cashFlowMetricRow(maxCol, periods, "Company Investments", (p) => p.contributions, S.currency),
    cashFlowMetricRow(maxCol, periods, "LP Capital Calls", (p) => p.grossContributions, S.currency),
    cashFlowMetricRow(maxCol, periods, "Gross Distributions", (p) => p.distributions, S.currency),
    cashFlowMetricRow(maxCol, periods, "GP Carry", (p) => -p.gpCarry, S.currency),
    cashFlowMetricRow(maxCol, periods, "Net Distributions", (p) => p.netDistributions, S.currency),
    cashFlowMetricRow(maxCol, periods, "Net Cash Flow", (p) => p.netCashFlow, S.currency),
    cashFlowMetricRow(maxCol, periods, "Cumulative Net Cash Flow", (p) => p.cumulativeNetCashFlow, S.currency),
    cashFlowMetricRow(maxCol, periods, "NAV Remaining", (p) => p.navRemaining, S.currency),
  ];

  return {
    name: "Cash Flows",
    rows,
    merges: [`B2:${columnName(maxCol)}2`],
    freezeTopRows: 5,
    columns: [
      { min: 1, max: 1, width: 3 },
      { min: 2, max: 2, width: 26 },
      { min: 3, max: maxCol, width: 13 },
    ],
  };
}

function buildCashFlowHeaderRow(
  maxCol: number,
  periods: CashFlowPeriod[],
  kind: "year" | "label" | "date"
): Cell[] {
  const entries: Array<[number, Cell]> = [
    [2, cell(kind === "year" ? "" : kind === "label" ? "Period" : "Date", S.header)],
  ];
  periods.forEach((period, index) => {
    const col = 3 + index;
    if (kind === "year") entries.push([col, cell(`Year ${Math.floor(period.index / 4) + 1}`, S.header)]);
    if (kind === "label") entries.push([col, cell(period.label, S.header)]);
    if (kind === "date") entries.push([col, cell(dateValue(period.date), S.date)]);
  });
  return row(maxCol, entries);
}

function cashFlowMetricRow(
  maxCol: number,
  periods: CashFlowPeriod[],
  label: string,
  getValue: (period: CashFlowPeriod) => number,
  style: StyleId
): Cell[] {
  const entries: Array<[number, Cell]> = [[2, cell(label, S.label)]];
  periods.forEach((period, index) => entries.push([3 + index, cellNumber(getValue(period), style)]));
  return row(maxCol, entries);
}

function mergeRows(maxCol: number, left: Cell[], right: Cell[]): Cell[] {
  const merged = Array.from({ length: maxCol }, (_, index) => left[index] ?? blank());
  right.forEach((cellValue, index) => {
    if (hasCell(cellValue)) merged[index] = cellValue;
  });
  return merged;
}

function hasCell(value: Cell): boolean {
  return value.value != null || value.formula != null || value.style != null;
}

function cellNumber(value: number, style: StyleId): Cell {
  return cell(Number.isFinite(value) ? value : 0, style);
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function yearsBetween(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return +((endMs - startMs) / 86_400_000 / 365).toFixed(1);
}

function createXlsx(sheets: SheetSpec[]): Buffer {
  const files = new Map<string, string | Buffer>();
  files.set("[Content_Types].xml", contentTypesXml(sheets.length));
  files.set("_rels/.rels", rootRelsXml());
  files.set("docProps/core.xml", corePropsXml());
  files.set("docProps/app.xml", appPropsXml(sheets));
  files.set("xl/workbook.xml", workbookXml(sheets));
  files.set("xl/_rels/workbook.xml.rels", workbookRelsXml(sheets.length));
  files.set("xl/styles.xml", stylesXml());
  sheets.forEach((sheet, index) => {
    files.set(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet));
  });
  return zipFiles(files);
}

function contentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`
  );
}

function rootRelsXml(): string {
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
  );
}

function workbookXml(sheets: SheetSpec[]): string {
  const sheetXml = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(safeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join("");
  return xml(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews><sheets>${sheetXml}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
}

function corePropsXml(): string {
  const now = new Date().toISOString();
  return xml(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>PortfolioForge</dc:creator><cp:lastModifiedBy>PortfolioForge</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
  );
}

function appPropsXml(sheets: SheetSpec[]): string {
  const names = sheets.map((sheet) => `<vt:lpstr>${escapeXml(safeSheetName(sheet.name))}</vt:lpstr>`).join("");
  return xml(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PortfolioForge</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${names}</vt:vector></TitlesOfParts></Properties>`
  );
}

function sheetXml(sheet: SheetSpec): string {
  const maxCol = Math.max(1, ...sheet.rows.map((sheetRow) => sheetRow.length));
  const maxRow = Math.max(1, sheet.rows.length);
  const dimension = `A1:${columnName(maxCol)}${maxRow}`;
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map((col) => `<col min="${col.min}" max="${col.max}" width="${col.width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const sheetViews = sheet.freezeTopRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeTopRows}" topLeftCell="A${sheet.freezeTopRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const sheetData = sheet.rows
    .map((sheetRow, rowIndex) => {
      const cells = sheetRow
        .map((cellValue, colIndex) => cellXml(cellValue, rowIndex + 1, colIndex + 1))
        .filter(Boolean)
        .join("");
      return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : "";
    })
    .filter(Boolean)
    .join("");
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/>${sheetViews}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${sheetData}</sheetData>${merges}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
  );
}

function cellXml(cellValue: Cell, rowIndex: number, colIndex: number): string {
  if (!hasCell(cellValue)) return "";
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const style = cellValue.style != null ? ` s="${cellValue.style}"` : "";
  const formulaXml = cellValue.formula ? `<f>${escapeXml(cellValue.formula)}</f>` : "";
  const value = cellValue.value;

  if (value == null) return `<c r="${ref}"${style}>${formulaXml}</c>`;
  if (typeof value === "string") {
    if (cellValue.formula) {
      return `<c r="${ref}"${style}>${formulaXml}<v>${escapeXml(value)}</v></c>`;
    }
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${style} t="b">${formulaXml}<v>${value ? "1" : "0"}</v></c>`;
  }
  if (value instanceof Date) {
    return `<c r="${ref}"${style}>${formulaXml}<v>${excelDate(value)}</v></c>`;
  }
  const num = Number.isFinite(value) ? value : 0;
  return `<c r="${ref}"${style}>${formulaXml}<v>${num}</v></c>`;
}

function stylesXml(): string {
  return xml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="5"><numFmt numFmtId="164" formatCode="$#,##0;[Red]($#,##0);-"/><numFmt numFmtId="165" formatCode="0.0%;[Red](0.0%);-"/><numFmt numFmtId="166" formatCode="0.0x;[Red](0.0x);-"/><numFmt numFmtId="167" formatCode="mmm-yy"/><numFmt numFmtId="168" formatCode="#,##0;[Red](#,##0);-"/></numFmts><fonts count="6"><font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF008000"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="21"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="3" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="165" fontId="3" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="166" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf><xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="166" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="168" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`
  );
}

function xml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function safeSheetName(name: string): string {
  return name.replace(/[\[\]*?:/\\]/g, " ").slice(0, 31) || "Sheet";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(col: number): string {
  let name = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function excelDate(date: Date): number {
  return 25569 + date.getTime() / 86_400_000;
}

function zipFiles(files: Map<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(localFiles.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDir, end]);
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
