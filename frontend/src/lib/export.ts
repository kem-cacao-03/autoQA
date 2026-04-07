// @ts-ignore – xlsx-js-style ships its own types
import XLSXStyle from "xlsx-js-style";
import JSZip from "jszip";
import type { GenerationResult, ResearchProviderResult } from "@/lib/api";

// ── Colour palette ────────────────────────────────────────────────────────────
const HEADER_BG = "4F46E5";
const HEADER_FG = "FFFFFF";
const ROW_ALT_BG = "EEF2FF";
const BORDER_CLR = "C7D2FE";
const TITLE_BG = "312E81";
const TITLE_FG = "FFFFFF";
const MARKED_BG = "FEF9C3";
const MARKED_BORDER = "FDE047";

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

const cellStyle = (rowIndex: number, wrap = false, marked = false) => ({
  font: { sz: 10, color: { rgb: "1E293B" } },
  fill: marked
    ? { patternType: "solid", fgColor: { rgb: MARKED_BG } }
    : rowIndex % 2 === 0
      ? { patternType: "solid", fgColor: { rgb: "FFFFFF" } }
      : { patternType: "solid", fgColor: { rgb: ROW_ALT_BG } },
  alignment: { vertical: "top", wrapText: wrap },
  border: border(marked ? MARKED_BORDER : undefined),
});

const priorityStyle = (priority: string, rowIndex: number, marked = false) => {
  const base = cellStyle(rowIndex, false, marked);
  const fg =
    priority === "High" ? "DC2626" :
      priority === "Medium" ? "D97706" :
        priority === "Low" ? "16A34A" : "1E293B";
  return { ...base, font: { ...base.font, bold: true, color: { rgb: fg } } };
};

const passfailCellStyle = (rowIndex: number, marked = false) => ({
  font: { sz: 10, color: { rgb: "94A3B8" } },
  fill: marked
    ? { patternType: "solid", fgColor: { rgb: MARKED_BG } }
    : rowIndex % 2 === 0
      ? { patternType: "solid", fgColor: { rgb: "FFFFFF" } }
      : { patternType: "solid", fgColor: { rgb: ROW_ALT_BG } },
  alignment: { horizontal: "center", vertical: "center" },
  border: border(marked ? MARKED_BORDER : undefined),
});

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS: { key: string; label: string; wch: number; wrap?: boolean; isPassFail?: boolean }[] = [
  { key: "PassFail", label: "Pass/Fail", wch: 10, isPassFail: true },
  { key: "ID", label: "Test Case ID", wch: 14 },
  { key: "Title", label: "Title", wch: 42 },
  { key: "Priority", label: "Priority", wch: 10 },
  { key: "Category", label: "Category", wch: 16 },
  { key: "Preconditions", label: "Preconditions", wch: 38, wrap: true },
  { key: "Steps", label: "Steps", wch: 58, wrap: true },
  { key: "Expected_Result", label: "Expected Result", wch: 48, wrap: true },
];

// col index helper
const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i]));

// ── Sheet builder (styling only – no autofilter/validation here) ──────────────
function buildSheet(
  cases: Record<string, unknown>[],
  sheetTitle: string,
  markedIds: Set<string> = new Set(),
): { ws: object; dataRows: number } {
  const ws: Record<string, unknown> = {};
  const totalCols = COLUMNS.length;

  // Row 0: title banner
  for (let c = 0; c < totalCols; c++) {
    ws[XLSXStyle.utils.encode_cell({ r: 0, c })] =
      c === 0
        ? { v: sheetTitle, t: "s", s: titleStyle }
        : { v: "", t: "s", s: titleStyle };
  }
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];

  // Row 1: headers
  COLUMNS.forEach((col, c) => {
    ws[XLSXStyle.utils.encode_cell({ r: 1, c })] = {
      v: col.label, t: "s", s: headerStyle,
    };
  });

  // Rows 2…N: data
  cases.forEach((tc, i) => {
    const rowIndex = i;
    const tcId = String(tc.test_case_id ?? tc.id ?? "");
    const isMarked = markedIds.has(tcId);

    const dataRow: Record<string, string> = {
      PassFail: "",
      ID: tcId,
      Title: String(tc.title ?? ""),
      Priority: String(tc.priority ?? ""),
      Category: String(tc.category ?? ""),
      Preconditions: Array.isArray(tc.preconditions)
        ? (tc.preconditions as string[]).join("\n") : "",
      Steps: Array.isArray(tc.steps)
        ? (tc.steps as string[]).map((s, idx) => `${idx + 1}. ${s}`).join("\n") : "",
      Expected_Result: String(tc.expected_result ?? tc.expected_outcome ?? ""),
    };

    COLUMNS.forEach((col, c) => {
      let style;
      if (col.isPassFail) style = passfailCellStyle(rowIndex, isMarked);
      else if (col.key === "Priority") style = priorityStyle(dataRow.Priority, rowIndex, isMarked);
      else style = cellStyle(rowIndex, col.wrap, isMarked);

      ws[XLSXStyle.utils.encode_cell({ r: i + 2, c })] = {
        v: dataRow[col.key], t: "s", s: style,
      };
    });
  });

  ws["!ref"] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cases.length + 1, c: totalCols - 1 } });
  ws["!cols"] = COLUMNS.map((col) => ({ wch: col.wch }));
  ws["!rows"] = [{ hpt: 22 }, { hpt: 28 }, ...cases.map(() => ({ hpt: 54 }))];

  return { ws, dataRows: cases.length };
}

// ── XML injection: add autoFilter + dataValidation into sheet XML ─────────────
function injectSheetFeatures(xml: string, dataRows: number): string {
  const lastDataRow = dataRows + 2; // Excel 1-indexed

  // 1. AutoFilter — chỉ hiện mũi tên ở Pass/Fail (col 0), Priority (col 3), Category (col 4)
  //    hiddenButton="1" = ẨN mũi tên; omit hiddenButton => hiện mũi tên
  const lastCol = XLSXStyle.utils.encode_col(COLUMNS.length - 1);
  const autoFilterXml =
    `<autoFilter ref="A2:${lastCol}2">` +
    `<filterColumn colId="${COL.ID}" hiddenButton="1"/>` +
    `<filterColumn colId="${COL.Title}" hiddenButton="1"/>` +
    `<filterColumn colId="${COL.Preconditions}" hiddenButton="1"/>` +
    `<filterColumn colId="${COL.Steps}" hiddenButton="1"/>` +
    `<filterColumn colId="${COL.Expected_Result}" hiddenButton="1"/>` +
    `</autoFilter>`;

  // 2. DataValidation dropdown cho cột Pass/Fail (col A = PassFail)
  //    showDropDown="0" hoặc bỏ trống => HIỆN mũi tên dropdown (OOXML quirk)
  const dataValidXml =
    `<dataValidations count="1">` +
    `<dataValidation type="list" sqref="A3:A${lastDataRow}" showDropDown="0" allowBlank="1">` +
    `<formula1>&quot;Pass,Fail&quot;</formula1>` +
    `</dataValidation>` +
    `</dataValidations>`;

  // Xoá autoFilter cũ nếu có (do xlsx-js-style có thể đã ghi)
  let out = xml.replace(/<autoFilter[^>]*\/>/g, "")
    .replace(/<autoFilter[\s\S]*?<\/autoFilter>/g, "");

  // Xoá dataValidations cũ nếu có
  out = out.replace(/<dataValidations[\s\S]*?<\/dataValidations>/g, "");

  // Chèn trước </worksheet>
  out = out.replace("</worksheet>", autoFilterXml + dataValidXml + "</worksheet>");

  return out;
}

// ── Public helpers ────────────────────────────────────────────────────────────
export function downloadJSON(
  result: GenerationResult | undefined,
  research: ResearchProviderResult[] | undefined,
  filename = "test-cases.json",
) {
  const data = result ?? research;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function downloadExcel(
  result: GenerationResult | undefined,
  research: ResearchProviderResult[] | undefined,
  filename = "test-cases.xlsx",
  markedIds: Set<string> = new Set(),
) {
  const wb = XLSXStyle.utils.book_new();

  // Track dataRows per sheet name for post-processing
  const sheetDataRows: Record<string, number> = {};

  const addSheet = (cases: Record<string, unknown>[], name: string, title: string) => {
    if (!cases.length) return;
    const { ws, dataRows } = buildSheet(cases, title, markedIds);
    const sheetName = name.slice(0, 31);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetName);
    sheetDataRows[sheetName] = dataRows;
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

  // Write xlsx to ArrayBuffer, then post-process XML via JSZip
  const buffer = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

  const zip = await JSZip.loadAsync(buffer);
  const sheetNames = Object.keys(wb.Sheets);

  await Promise.all(
    sheetNames.map(async (name, idx) => {
      const fileName = `xl/worksheets/sheet${idx + 1}.xml`;
      const file = zip.file(fileName);
      if (!file) return;
      const xml = await file.async("string");
      const dataRows = sheetDataRows[name] ?? 0;
      zip.file(fileName, injectSheetFeatures(xml, dataRows));
    }),
  );

  const blob = new Blob(
    [await zip.generateAsync({ type: "arraybuffer" })],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
