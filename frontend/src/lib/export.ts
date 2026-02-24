// @ts-ignore – xlsx-js-style ships its own types
import XLSXStyle from "xlsx-js-style";
import type { GenerationResult, ResearchProviderResult } from "@/lib/api";

// ── Colour palette ────────────────────────────────────────────────────────────
const HEADER_BG = "4F46E5"; // indigo-600
const HEADER_FG = "FFFFFF";
const ROW_ALT_BG = "EEF2FF"; // indigo-50
const BORDER_CLR = "C7D2FE"; // indigo-200
const TITLE_BG = "312E81"; // indigo-900  (sheet title row)
const TITLE_FG = "FFFFFF";

// ── Reusable style helpers ────────────────────────────────────────────────────
const border = (color = BORDER_CLR) => ({
  top: { style: "thin", color: { rgb: color } },
  bottom: { style: "thin", color: { rgb: color } },
  left: { style: "thin", color: { rgb: color } },
  right: { style: "thin", color: { rgb: color } },
});

const headerStyle = {
  font: { bold: true, color: { rgb: HEADER_FG }, sz: 11 },
  fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: border("818CF8"),
};

const titleStyle = {
  font: { bold: true, color: { rgb: TITLE_FG }, sz: 13 },
  fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
  alignment: { horizontal: "left", vertical: "center" },
};

const cellStyle = (rowIndex: number, wrap = false) => ({
  font: { sz: 10, color: { rgb: "1E293B" } },
  fill: rowIndex % 2 === 0
    ? { patternType: "solid", fgColor: { rgb: "FFFFFF" } }
    : { patternType: "solid", fgColor: { rgb: ROW_ALT_BG } },
  alignment: { vertical: "top", wrapText: wrap },
  border: border(),
});

const priorityStyle = (priority: string, rowIndex: number) => {
  const base = cellStyle(rowIndex);
  const fg =
    priority === "High" ? "DC2626" :
      priority === "Medium" ? "D97706" :
        priority === "Low" ? "16A34A" : "1E293B";
  return { ...base, font: { ...base.font, bold: true, color: { rgb: fg } } };
};

// ── Column definitions ─────────────────────────────────────────────────────────
const COLUMNS: { key: string; label: string; wch: number; wrap?: boolean }[] = [
  { key: "ID", label: "Test Case ID", wch: 14 },
  { key: "Title", label: "Title", wch: 42 },
  { key: "Priority", label: "Priority", wch: 10 },
  { key: "Category", label: "Category", wch: 16 },
  { key: "Preconditions", label: "Preconditions", wch: 38, wrap: true },
  { key: "Steps", label: "Steps", wch: 58, wrap: true },
  { key: "Expected_Result", label: "Expected Result", wch: 48, wrap: true },
];

// ── Sheet builder ──────────────────────────────────────────────────────────────
function buildSheet(
  cases: Record<string, unknown>[],
  sheetTitle: string,
): object {
  const ws: Record<string, unknown> = {};
  const totalCols = COLUMNS.length;

  // ── Row 0: merged title banner ─────────────────────────────────────────────
  for (let c = 0; c < totalCols; c++) {
    const addr = XLSXStyle.utils.encode_cell({ r: 0, c });
    ws[addr] = c === 0
      ? { v: sheetTitle, t: "s", s: titleStyle }
      : { v: "", t: "s", s: titleStyle };
  }
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];

  // ── Row 1: column headers ──────────────────────────────────────────────────
  COLUMNS.forEach((col, c) => {
    ws[XLSXStyle.utils.encode_cell({ r: 1, c })] = {
      v: col.label, t: "s", s: headerStyle,
    };
  });

  // ── Rows 2…N: data ──────────────────────────────────────────────────────────
  cases.forEach((tc, i) => {
    const rowIndex = i; // for alternating colours
    const dataRow: Record<string, string> = {
      ID: String(tc.test_case_id ?? tc.id ?? ""),
      Title: String(tc.title ?? ""),
      Priority: String(tc.priority ?? ""),
      Category: String(tc.category ?? ""),
      Preconditions: Array.isArray(tc.preconditions)
        ? (tc.preconditions as string[]).join("\n")
        : "",
      Steps: Array.isArray(tc.steps)
        ? (tc.steps as string[]).map((s, idx) => `${idx + 1}. ${s}`).join("\n")
        : "",
      Expected_Result: String(tc.expected_result ?? tc.expected_outcome ?? ""),
    };

    COLUMNS.forEach((col, c) => {
      const style = col.key === "Priority"
        ? priorityStyle(dataRow.Priority, rowIndex)
        : cellStyle(rowIndex, col.wrap);
      ws[XLSXStyle.utils.encode_cell({ r: i + 2, c })] = {
        v: dataRow[col.key], t: "s", s: style,
      };
    });
  });

  // ── Sheet range ─────────────────────────────────────────────────────────────
  ws["!ref"] = XLSXStyle.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: cases.length + 1, c: totalCols - 1 },
  });

  // ── Column widths + row heights ─────────────────────────────────────────────
  ws["!cols"] = COLUMNS.map((col) => ({ wch: col.wch }));
  ws["!rows"] = [
    { hpt: 22 },  // title row
    { hpt: 28 },  // header row
    ...cases.map(() => ({ hpt: 54 })), // data rows (tall enough for wrap)
  ];

  return ws;
}

// ── Public helpers ─────────────────────────────────────────────────────────────
export function downloadJSON(
  result: GenerationResult | undefined,
  research: ResearchProviderResult[] | undefined,
  filename = "test-cases.json",
) {
  const data = result ?? research;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(
  result: GenerationResult | undefined,
  research: ResearchProviderResult[] | undefined,
  filename = "test-cases.xlsx",
) {
  const wb = XLSXStyle.utils.book_new();

  const addSheet = (cases: Record<string, unknown>[], name: string, title: string) => {
    if (!cases.length) return;
    const ws = buildSheet(cases, title);
    XLSXStyle.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  if (result) {
    addSheet(
      result.test_cases as Record<string, unknown>[],
      "Test Cases",
      `${result.test_suite_name ?? "Test Suite"} — ${result.provider ?? ""}`,
    );
  }

  if (research) {
    research.forEach((r) => {
      if (r.success && r.result) {
        addSheet(
          r.result.test_cases as Record<string, unknown>[],
          r.provider,
          `${r.result.test_suite_name ?? r.provider} — ${r.provider}`,
        );
      }
    });
  }

  XLSXStyle.writeFile(wb, filename);
}
