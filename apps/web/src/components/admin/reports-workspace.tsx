"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { client } from "@/utils/orpc";

const definitions = {
  sales: ["Sales", "Verified paid orders from online checkout and the point of sale"],
  orders: ["Orders", "Order volume and fulfillment status"],
  payments: ["Payments", "Payment attempts and successful collections"],
  inventory: ["Inventory", "Current stock and low stock variants"],
  customers: ["Customers", "Customers and their recorded order activity"],
  products: ["Products", "Paid units and product revenue across online and in-store orders"],
} as const;
type Kind = keyof typeof definitions;
const asDate = (date: Date) => date.toISOString().slice(0, 10);
function exportPage(filename: string, rows: { date: string; label: string; detail: string; status: string; amount: number }[]) {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/[\r\n"]+/g, " ").replaceAll('"', '""')}"`;
  const csv = [["Date", "Item", "Details", "Status", "Amount GHS / Units"], ...rows.map((r) => [r.date, r.label, r.detail, r.status, r.amount])].map((line) => line.map(quote).join(",")).join("\r\n");
  const link = document.createElement("a"); const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ghs(value: number) { return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(value); }

export function ReportsWorkspace({ path }: { path: string }) {
  const routeKind = path.split("/").at(-1) ?? "sales";
  const kind: Kind = routeKind in definitions ? routeKind as Kind : "sales";
  const [to, setTo] = useState(() => asDate(new Date()));
  const [from, setFrom] = useState(() => asDate(new Date(Date.now() - 29 * 86_400_000)));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState("");
  const title = definitions[kind][0];
  const query = useQuery({ queryKey: ["admin-report", kind, from, to, search, page], queryFn: () => client.adminReport({ kind, from, to, search, page, pageSize: 25 }), enabled: from <= to, staleTime: 15_000, placeholderData: (previous) => previous });
  const data = query.data;
  const rows = data?.rows ?? [];
  const moneyReport = kind !== "inventory";
  async function exportFilteredReport() {
    if (!data?.total || from > to || exporting) return;
    const exportFilters = { kind, from, to, search, pageSize: 100 };
    const maximumRows = 50_000;
    setExporting(true); setExportProgress(0); setExportError("");
    try {
      const first = await client.adminReport({ ...exportFilters, page: 1 });
      if (first.total > maximumRows) throw new Error("This report is larger than the 50,000-row export limit. Narrow the date range or search, then export again.");
      const allRows = [...first.rows];
      setExportProgress(allRows.length);
      const pageCount = Math.ceil(first.total / exportFilters.pageSize);
      for (let batchStart = 2; batchStart <= pageCount; batchStart += 4) {
        const pages = Array.from({ length: Math.min(4, pageCount - batchStart + 1) }, (_, index) => batchStart + index);
        const batch = await Promise.all(pages.map((exportPageNumber) => client.adminReport({ ...exportFilters, page: exportPageNumber })));
        if (batch.some((result) => result.total !== first.total || JSON.stringify(result.summary) !== JSON.stringify(first.summary))) throw new Error("Report totals changed while exporting. Please retry so the CSV does not mix different report states.");
        allRows.push(...batch.flatMap((result) => result.rows));
        setExportProgress(allRows.length);
      }
      if (allRows.length !== first.total || new Set(allRows.map((row) => row.id)).size !== allRows.length) throw new Error("The complete report could not be retrieved consistently. Please retry or narrow the filters.");
      exportPage(`basny-${kind}-${from}-to-${to}.csv`, allRows);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The report could not be exported. Please retry.");
    } finally {
      setExporting(false);
    }
  }
  return <div className="ops-workspace"><header className="ops-heading"><div><p className="admin-eyebrow">REPORTS · {title.toUpperCase()}</p><h1>{title} report</h1><p>{definitions[kind][1]}. All amounts are in Ghana cedis.</p></div><button className="admin-primary-button" type="button" disabled={!data?.total || exporting || from > to} onClick={() => void exportFilteredReport()}><HugeiconsIcon icon={Download01Icon} aria-hidden="true" />{exporting ? `Exporting ${exportProgress.toLocaleString()} / ${data?.total.toLocaleString() ?? "…"}` : "Export filtered report"}</button></header><div className="ops-report-filters"><label className="ops-field">From<input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label className="ops-field">To<input type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label><label className="ops-search"><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`} /></label></div>{exportError && <p className="ops-error" role="alert">{exportError}</p>}{from > to && <p className="ops-error" role="alert">The end date must be on or after the start date.</p>}{query.isError && <section className="ops-empty" role="alert"><h2>Report data could not be loaded</h2><p>Check your staff permissions and connection.</p><button className="admin-secondary-button" type="button" onClick={() => void query.refetch()}>Retry</button></section>}{query.isLoading && <section className="ops-settings-card" aria-busy="true" aria-label="Loading report"><div className="ops-skeleton-line" /><div className="ops-skeleton-line" /><div className="ops-skeleton-line" /><div className="ops-skeleton-line" /></section>}{data && <><div className="ops-stats"><div><span>{kind === "inventory" ? "Units on hand" : kind === "products" || kind === "customers" ? "Revenue in view" : kind === "sales" ? "Paid order value" : kind === "payments" ? "Successful payments" : "Paid order value"}</span><strong>{moneyReport ? ghs(data.summary.total) : data.summary.total}</strong><small>{data.summary.count} matching records</small></div><div><span>{data.summary.secondaryLabel}</span><strong>{data.summary.secondaryValue}</strong><small>{kind === "inventory" ? "Current catalogue stock snapshot" : "Selected period"}</small></div><div><span>Reporting period</span><strong>{kind === "inventory" ? "Current" : `${from} → ${to}`}</strong><small>Accra time (GMT)</small></div></div><div className="ops-toolbar"><span className="ops-result-count">{data.total} rows{query.isFetching ? " · refreshing" : ""}</span></div>{rows.length ? <><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>{kind === "inventory" ? "Updated" : "Date"}</th><th>{kind === "inventory" ? "Product variant" : kind === "products" ? "Product" : kind === "customers" ? "Customer" : kind === "payments" ? "Payment" : "Reference"}</th><th>Details</th><th>Status</th><th>{kind === "inventory" ? "Units" : "Amount"}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.date ? new Date(row.date).toLocaleDateString("en-GH", { timeZone: "Africa/Accra" }) : "—"}</td><td><strong>{row.label}</strong></td><td>{row.detail}</td><td><span className={`ops-status ${["paid", "delivered", "ok"].includes(row.status) ? "ops-status--good" : ["failed", "cancelled", "low"].includes(row.status) ? "ops-status--bad" : "ops-status--warm"}`}><i />{row.status}</span></td><td>{kind === "inventory" ? row.amount : ghs(row.amount)}</td></tr>)}</tbody></table></div><div className="ops-mobile-list">{rows.map((row) => <article className="ops-mobile-card" key={`${row.id}-mobile`}><div className="ops-mobile-card__top"><strong>{row.label}</strong><b>{kind === "inventory" ? row.amount : ghs(row.amount)}</b></div><span>{row.detail}</span><small>{row.date ? new Date(row.date).toLocaleDateString("en-GH", { timeZone: "Africa/Accra" }) : "Paid order history"} · {row.status}</small></article>)}</div><AdminPagination total={data.total} page={page} pageSize={25} onPageChange={setPage} label={`${title.toLowerCase()} report rows`} /></> : <div className="ops-empty"><h2>No {title.toLowerCase()} data for this period</h2><p>When BASNY records activity, the report will show it here.</p></div>}</>}</div>;
}
