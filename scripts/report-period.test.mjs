import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/report-period.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { reportRange, isInReportRange, localDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

assert.deepEqual(reportRange("Weekly", "2026-10-09"), { start: "2026-10-05", end: "2026-10-11" });
assert.deepEqual(reportRange("Weekly", "2026-10-11"), { start: "2026-10-05", end: "2026-10-11" });
assert.deepEqual(reportRange("Weekly", "2027-01-01"), { start: "2026-12-28", end: "2027-01-03" });
assert.deepEqual(reportRange("Monthly", "2024-02-15"), { start: "2024-02-01", end: "2024-02-29" });
assert.deepEqual(reportRange("Monthly", "2026-12-09"), { start: "2026-12-01", end: "2026-12-31" });
assert.deepEqual(reportRange("Yearly", "2026-10-09"), { start: "2026-01-01", end: "2026-12-31" });
assert.equal(reportRange("Weekly", ""), null);
assert.equal(isInReportRange("2026-10-09", null), false);
const dates = ["2025-12-31", "2026-01-01", "2026-09-30", "2026-10-04", "2026-10-05", "2026-10-11", "2026-10-12", "2026-10-31", "2026-11-01", "2026-12-31", "2027-01-01"];
assert.deepEqual(dates.filter(date => isInReportRange(date, reportRange("Weekly", "2026-10-09"))), ["2026-10-05", "2026-10-11"]);
assert.equal(dates.filter(date => isInReportRange(date, reportRange("Monthly", "2026-10-09"))).length, 5);
assert.equal(dates.filter(date => isInReportRange(date, reportRange("Yearly", "2026-10-09"))).length, 9);
const lateLocalTime = new Date(2026, 9, 11, 23, 59, 59);
assert.equal(localDate(lateLocalTime), "2026-10-11");
assert.equal(isInReportRange(lateLocalTime.toISOString(), reportRange("Weekly", "2026-10-09")), true);
console.log("Report period checks passed: calendar ranges, boundaries, leap years, and local timestamps.");
