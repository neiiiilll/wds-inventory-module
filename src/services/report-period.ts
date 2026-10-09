export type ReportPeriod = "Weekly" | "Monthly" | "Yearly";

export function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function reportRange(period: ReportPeriod, selectedDate: string) {
  const anchor = new Date(`${selectedDate}T12:00:00`);
  if (!selectedDate || Number.isNaN(anchor.getTime())) return null;
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (period === "Weekly") {
    start.setDate(anchor.getDate() - (anchor.getDay() + 6) % 7);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (period === "Monthly") {
    start.setDate(1);
    end.setMonth(anchor.getMonth() + 1, 0);
  } else {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return { start: localDate(start), end: localDate(end) };
}

export function isInReportRange(date: string, range: ReturnType<typeof reportRange>): boolean {
  if (!range) return false;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date(date));
  return day >= range.start && day <= range.end;
}
