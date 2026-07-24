import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Download,
  X,
  Wallet,
  BadgeCheck,
  Ban,
  SlidersHorizontal,
  PlayCircle,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  partially_settled: "bg-blue-100 text-blue-700",
  settled: "bg-emerald-100 text-emerald-700",
  waived: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS = {
  pending: "Due",
  partially_settled: "Partial",
  settled: "Settled",
  waived: "Waived",
};

const TRANSACTION_LABELS = {
  invoice_generated: "Invoice generated",
  wallet_deduction: "Wallet deduction",
  manual_payment: "Manual payment",
  waiver: "Waiver",
  adjustment: "Adjustment",
  legacy_carryforward: "Legacy carry-forward",
};

const BILLING_START = { year: 2026, month: 6 };

/** Completed billing months from Jun 2026 through the last closed calendar month. */
const buildBillingMonthOptions = () => {
  const options = [];
  const now = new Date();
  const lastClosed = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = new Date(BILLING_START.year, BILLING_START.month - 1, 1);

  if (lastClosed < start) return options;

  let cursor = new Date(lastClosed.getFullYear(), lastClosed.getMonth(), 1);
  while (cursor >= start) {
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const label = cursor.toLocaleString("en-IN", { month: "short", year: "numeric" });
    options.push({ value, label });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  return options;
};

const getDefaultBillingMonth = () => buildBillingMonthOptions()[0]?.value || "2026-06";

const SORT_OPTIONS = [
  { value: "gmv-desc", sortBy: "gmv", sortOrder: "desc", label: "GMV: High → Low" },
  { value: "gmv-asc", sortBy: "gmv", sortOrder: "asc", label: "GMV: Low → High" },
  { value: "wallet-desc", sortBy: "wallet", sortOrder: "desc", label: "Live Wallet: High → Low" },
  { value: "wallet-asc", sortBy: "wallet", sortOrder: "asc", label: "Live Wallet: Low → High" },
];

const AMOUNT_ON_OPTIONS = [
  { value: "gmv", label: "GMV" },
  { value: "wallet", label: "Live Wallet" },
];

function StatusPill({ status }) {
  const key = String(status || "pending").toLowerCase();
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[key] || STATUS_STYLES.pending}`}>
      {STATUS_LABELS[key] || key}
    </span>
  );
}

function ActionDialog({ action, invoice, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!action || !invoice) return null;

  const outstanding = Number(invoice.outstandingAmount || 0);
  const config = {
    deduct: {
      title: "Deduct from Wallet",
      description: `Deduct part or all of the outstanding due (${formatMoney(outstanding)}) directly from the restaurant's wallet balance. The locked amount is released as it is settled.`,
      needsAmount: true,
      confirmLabel: "Deduct",
      danger: false,
    },
    markPaid: {
      title: "Mark as Paid",
      description: `Record a payment the restaurant made outside the platform (cash / bank transfer). Leave amount empty to settle the full outstanding of ${formatMoney(outstanding)}.`,
      needsAmount: true,
      confirmLabel: "Mark Paid",
      danger: false,
    },
    waive: {
      title: "Waive Due",
      description: `The full remaining due of ${formatMoney(outstanding)} will be waived and the locked wallet amount released immediately. This cannot be undone.`,
      needsAmount: false,
      confirmLabel: "Waive",
      danger: true,
    },
    adjust: {
      title: "Manual Adjustment",
      description: "Enter a positive amount to increase the outstanding due, or a negative amount to reduce it (floored at zero).",
      needsAmount: true,
      confirmLabel: "Apply Adjustment",
      danger: false,
    },
  }[action];

  const submit = async () => {
    if (!remarks.trim()) {
      toast.error("Remarks are required");
      return;
    }
    const numericAmount = amount === "" ? null : Number(amount);
    if (action === "deduct" && (!numericAmount || numericAmount <= 0)) {
      toast.error("Enter a valid deduction amount");
      return;
    }
    if (action === "adjust" && (!numericAmount || numericAmount === 0)) {
      toast.error("Enter a non-zero adjustment amount");
      return;
    }
    try {
      setSubmitting(true);
      const body = { remarks: remarks.trim() };
      if (numericAmount != null) body.amount = numericAmount;
      if (action === "deduct") await adminAPI.deductInvoiceFromWallet(invoice._id, body);
      if (action === "markPaid") await adminAPI.markInvoicePaid(invoice._id, body);
      if (action === "waive") await adminAPI.waiveInvoice(invoice._id, body);
      if (action === "adjust") await adminAPI.adjustInvoice(invoice._id, body);
      toast.success(`${config.title} successful`);
      onDone();
    } catch (error) {
      toast.error(error?.response?.data?.message || `${config.title} failed`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100">
          <X className="w-4 h-4 text-slate-500" />
        </button>
        <h3 className="text-lg font-bold text-slate-900">{config.title}</h3>
        <p className="text-xs text-slate-500 mt-1">
          {invoice.restaurant?.restaurantName || ""} • {invoice.billingMonthLabel || invoice.billingMonth}
        </p>
        <p className={`text-sm mt-3 leading-relaxed ${config.danger ? "text-red-600" : "text-slate-600"}`}>
          {config.description}
        </p>

        {config.needsAmount && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Amount (₹){action === "markPaid" ? " — optional, defaults to full due" : ""}
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={action === "adjust" ? "e.g. 100 or -100" : `Max ${outstanding}`}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks (required)</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Reason / reference for this action"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 ${
              config.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {submitting ? "Processing..." : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDrawer({ invoiceId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getSubscriptionInvoiceAdmin(invoiceId);
      setDetail(res?.data?.data || null);
    } catch (_error) {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) fetchDetail();
  }, [invoiceId]);

  if (!invoiceId) return null;
  const invoice = detail?.invoice;
  const transactions = detail?.transactions || [];
  const outstanding = Number(invoice?.outstandingAmount || 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {invoice ? invoice.billingMonthLabel || invoice.billingMonth : "Invoice"}
            </h3>
            <p className="text-xs text-slate-500">{invoice?.restaurant?.restaurantName || ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading invoice...</div>
        ) : !invoice ? (
          <div className="p-8 text-center text-slate-500">Invoice not found.</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <StatusPill status={invoice.status} />
              <p className={`text-sm font-bold ${outstanding > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {outstanding > 0 ? `Outstanding ${formatMoney(outstanding)}` : "Cleared"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-slate-500">Live wallet balance</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.wallet?.walletBalance)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-slate-500">Available to withdraw</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.wallet?.netAvailable)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">Monthly GMV</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.gmv)}</p>
                <p className="text-[10px] text-slate-400">{invoice.orderCount || 0} delivered orders</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">Plan</p>
                <p className="font-bold text-slate-900 text-sm capitalize">{invoice.planName}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">Plan amount</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.planAmount)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">GST (18%)</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.gstAmount)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">Invoice total</p>
                <p className="font-bold text-slate-900 text-sm">{formatMoney(invoice.totalAmount)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500">Paid / Waived</p>
                <p className="font-bold text-slate-900 text-sm">
                  {formatMoney(invoice.paidAmount)} / {formatMoney(invoice.waivedAmount)}
                </p>
              </div>
            </div>

            {outstanding > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAction("deduct")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Wallet className="w-3.5 h-3.5" /> Deduct from Wallet
                </button>
                <button
                  onClick={() => setAction("markPaid")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  <BadgeCheck className="w-3.5 h-3.5" /> Mark Paid
                </button>
                <button
                  onClick={() => setAction("waive")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                >
                  <Ban className="w-3.5 h-3.5" /> Waive
                </button>
                <button
                  onClick={() => setAction("adjust")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
                </button>
              </div>
            )}
            {outstanding <= 0 && (
              <button
                onClick={() => setAction("adjust")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Manual Adjustment
              </button>
            )}

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Transaction history</h4>
              {transactions.length === 0 ? (
                <p className="text-xs text-slate-500">No transactions.</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div key={tx._id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-900">
                          {TRANSACTION_LABELS[tx.type] || tx.type}
                        </p>
                        <p className="text-xs font-bold text-slate-900">{formatMoney(tx.amount)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                        <span>
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ""}
                          {tx.processedBy?.role === "ADMIN"
                            ? ` • Admin${tx.processedBy?.name ? ` (${tx.processedBy.name})` : ""}`
                            : " • System"}
                        </span>
                        <span>Remaining: {formatMoney(tx.outstandingAfter)}</span>
                      </div>
                      {tx.remarks ? <p className="text-[10px] text-slate-500 mt-1 italic">{tx.remarks}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {action && (
        <ActionDialog
          action={action}
          invoice={invoice}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            fetchDetail();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default function SubscriptionHistory() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [summary, setSummary] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const months = useMemo(() => buildBillingMonthOptions(), []);
  const [filters, setFilters] = useState(() => ({
    billingMonth: getDefaultBillingMonth(),
    zoneId: "",
    planName: "",
    status: "",
    dueOnly: false,
    sortValue: "gmv-desc",
  }));
  const [zones, setZones] = useState([]);
  const [amountDraft, setAmountDraft] = useState({ amountOn: "gmv", amountMin: "", amountMax: "" });
  const [amountFilters, setAmountFilters] = useState({ amountOn: "gmv", amountMin: "", amountMax: "" });
  const [page, setPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [runningBilling, setRunningBilling] = useState(false);

  const buildListParams = (
    activeFilters = filters,
    activeAmount = amountFilters,
    activePage = page,
    activeSearch = appliedSearch,
  ) => {
    const sort = SORT_OPTIONS.find((opt) => opt.value === activeFilters.sortValue) || SORT_OPTIONS[0];
    const params = {
      page: activePage,
      limit: 20,
      billingMonth: activeFilters.billingMonth || getDefaultBillingMonth(),
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    };
    if (activeSearch.trim()) params.search = activeSearch.trim();
    if (activeFilters.zoneId) params.zoneId = activeFilters.zoneId;
    if (activeFilters.planName) params.planName = activeFilters.planName;
    if (activeFilters.status) params.status = activeFilters.status;
    if (activeFilters.dueOnly) params.dueOnly = "true";
    if (activeAmount.amountOn) params.amountOn = activeAmount.amountOn;
    if (activeAmount.amountMin !== "") params.amountMin = activeAmount.amountMin;
    if (activeAmount.amountMax !== "") params.amountMax = activeAmount.amountMax;
    return params;
  };

  const fetchSummary = async () => {
    try {
      const res = await adminAPI.getSubscriptionBillingSummary({ months: 12 });
      setSummary(res?.data?.data || null);
    } catch (_error) {
      setSummary(null);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getSubscriptionInvoicesAdmin(buildListParams());
      const data = res?.data?.data || {};
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (_error) {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const submitSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const res = await adminAPI.getZones({ limit: 1000 });
        const zoneRows = res?.data?.data?.zones;
        if (Array.isArray(zoneRows)) {
          setZones(zoneRows);
        }
      } catch (_error) {
        setZones([]);
      }
    };
    fetchZones();
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [page, filters, amountFilters, appliedSearch]);

  const refreshAll = () => {
    fetchInvoices();
    fetchSummary();
  };

  const handleExport = async () => {
    try {
      const { page: _page, limit: _limit, ...exportParams } = buildListParams();
      const res = await adminAPI.exportSubscriptionInvoices(exportParams);
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "subscription-invoices.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (_error) {
      toast.error("Export failed");
    }
  };

  const handleRunBilling = async () => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const billingMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    if (!window.confirm(`Run billing for ${billingMonth}? Already-invoiced restaurants are skipped (safe to re-run).`)) return;
    try {
      setRunningBilling(true);
      const res = await adminAPI.runSubscriptionBilling(billingMonth);
      const data = res?.data?.data || {};
      toast.success(
        `Billing for ${billingMonth}: ${data.invoicedCount || 0} invoiced, ${data.skippedZeroGmvCount || 0} skipped (zero GMV), ${data.errorCount || 0} errors`
      );
      refreshAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Billing run failed");
    } finally {
      setRunningBilling(false);
    }
  };

  const totals = summary?.totals || {};

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Billing</h1>
            <p className="text-sm text-slate-600 mt-1">
              Calendar-month postpaid billing — invoices auto-generated from each restaurant's monthly GMV.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunBilling}
              disabled={runningBilling}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              {runningBilling ? "Running..." : "Run Billing"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-100"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-100"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Billed</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{formatMoney(totals.totalBilled)}</p>
            <p className="text-[10px] text-slate-400">{totals.invoiceCount || 0} invoices</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Collected</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{formatMoney(totals.totalPaid)}</p>
            <p className="text-[10px] text-slate-400">
              Wallet: {formatMoney(summary?.collectionByMethod?.wallet_deduction?.total)} • Manual:{" "}
              {formatMoney(summary?.collectionByMethod?.manual_payment?.total)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Outstanding</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{formatMoney(totals.totalOutstanding)}</p>
            <p className="text-[10px] text-slate-400">Locked in restaurant wallets</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Waived</p>
            <p className="text-xl font-bold text-purple-700 mt-1">{formatMoney(totals.totalWaived)}</p>
          </div>
        </div>

        {/* Monthly trend */}
        {Array.isArray(summary?.monthly) && summary.monthly.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
            <p className="text-xs text-slate-500 font-semibold uppercase mb-3">Month-wise billing summary</p>
            <table className="min-w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-1.5 pr-4 font-semibold">Month</th>
                  <th className="text-right py-1.5 px-3 font-semibold">Invoices</th>
                  <th className="text-right py-1.5 px-3 font-semibold">GMV</th>
                  <th className="text-right py-1.5 px-3 font-semibold">Billed</th>
                  <th className="text-right py-1.5 px-3 font-semibold">Collected</th>
                  <th className="text-right py-1.5 px-3 font-semibold">Waived</th>
                  <th className="text-right py-1.5 pl-3 font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {summary.monthly.map((row) => (
                  <tr key={row.billingMonth} className="border-t border-slate-100 text-slate-800">
                    <td className="py-1.5 pr-4 font-semibold">{row.label}</td>
                    <td className="py-1.5 px-3 text-right">{row.invoiceCount}</td>
                    <td className="py-1.5 px-3 text-right">{formatMoney(row.totalGmv)}</td>
                    <td className="py-1.5 px-3 text-right">{formatMoney(row.totalBilled)}</td>
                    <td className="py-1.5 px-3 text-right text-emerald-700">{formatMoney(row.totalPaid)}</td>
                    <td className="py-1.5 px-3 text-right text-purple-700">{formatMoney(row.totalWaived)}</td>
                    <td className="py-1.5 pl-3 text-right text-amber-700">{formatMoney(row.totalOutstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch();
                  }}
                  placeholder="Search restaurant, owner or phone"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={submitSearch}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
              >
                Search
              </button>
              {appliedSearch ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <select
              value={filters.billingMonth}
              onChange={(e) => { setPage(1); setFilters({ ...filters, billingMonth: e.target.value }); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              {months.length === 0 ? (
                <option value="2026-06">Jun 2026</option>
              ) : months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={filters.zoneId}
              onChange={(e) => { setPage(1); setFilters({ ...filters, zoneId: e.target.value }); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white min-w-[140px]"
            >
              <option value="">All zones</option>
              {zones.map((zone) => (
                <option key={zone._id} value={zone._id}>
                  {zone.zoneName || zone.name}
                </option>
              ))}
            </select>
            <select
              value={filters.sortValue}
              onChange={(e) => { setPage(1); setFilters({ ...filters, sortValue: e.target.value }); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={filters.planName}
              onChange={(e) => { setPage(1); setFilters({ ...filters, planName: e.target.value }); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              <option value="">All plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="premium">Premium</option>
              <option value="legacy">Legacy</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              <option value="">All statuses</option>
              <option value="pending">Due</option>
              <option value="partially_settled">Partially settled</option>
              <option value="settled">Settled</option>
              <option value="waived">Waived</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700 px-2">
              <input
                type="checkbox"
                checked={filters.dueOnly}
                onChange={(e) => { setPage(1); setFilters({ ...filters, dueOnly: e.target.checked }); }}
              />
              Due only
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Amount on</label>
              <select
                value={amountDraft.amountOn}
                onChange={(e) => setAmountDraft({ ...amountDraft, amountOn: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white min-w-[120px]"
              >
                {AMOUNT_ON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Min (₹)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={amountDraft.amountMin}
                onChange={(e) => setAmountDraft({ ...amountDraft, amountMin: e.target.value })}
                placeholder="0"
                className="w-28 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Max (₹)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={amountDraft.amountMax}
                onChange={(e) => setAmountDraft({ ...amountDraft, amountMax: e.target.value })}
                placeholder="e.g. 4000"
                className="w-28 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setAmountFilters({ ...amountDraft });
              }}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Apply amount
            </button>
            {(amountFilters.amountMin !== "" || amountFilters.amountMax !== "") && (
              <button
                type="button"
                onClick={() => {
                  const cleared = { amountOn: "gmv", amountMin: "", amountMax: "" };
                  setPage(1);
                  setAmountDraft(cleared);
                  setAmountFilters(cleared);
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Clear amount
              </button>
            )}
          </div>
        </div>

        {/* Invoices table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Month</th>
                <th className="text-left px-4 py-3 font-semibold">Restaurant</th>
                <th className="text-right px-4 py-3 font-semibold">Live Wallet</th>
                <th className="text-left px-4 py-3 font-semibold">Plan</th>
                <th className="text-right px-4 py-3 font-semibold">GMV</th>
                <th className="text-right px-4 py-3 font-semibold">Invoice</th>
                <th className="text-right px-4 py-3 font-semibold">Paid</th>
                <th className="text-right px-4 py-3 font-semibold">Outstanding</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>Loading invoices...</td></tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={9}>
                    <ReceiptText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    No invoices found. Invoices are generated automatically at each month end.
                  </td>
                </tr>
              ) : invoices.map((invoice) => (
                <tr
                  key={invoice._id}
                  onClick={() => setSelectedInvoiceId(invoice._id)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {invoice.billingMonthLabel || invoice.billingMonth}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{invoice.restaurant?.restaurantName || "-"}</p>
                    <p className="text-[10px] text-slate-500">{invoice.restaurant?.ownerPhone || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-slate-900">{formatMoney(invoice.wallet?.walletBalance)}</p>
                    {Number(invoice.wallet?.lockedAmount || 0) > 0 ? (
                      <p className="text-[10px] text-amber-700">
                        Avail: {formatMoney(invoice.wallet?.netAvailable)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500">Withdrawable</p>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">{invoice.planName}</td>
                  <td className="px-4 py-3 text-right text-slate-800">{formatMoney(invoice.gmv)}</td>
                  <td className="px-4 py-3 text-right text-slate-800">{formatMoney(invoice.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatMoney(invoice.paidAmount)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${invoice.outstandingAmount > 0 ? "text-amber-700" : "text-slate-400"}`}>
                    {formatMoney(invoice.outstandingAmount)}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={invoice.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <p>{pagination.total} invoices</p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedInvoiceId && (
        <InvoiceDrawer
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
