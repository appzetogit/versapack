import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bike,
  CheckCircle,
  Loader2,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";

const statusClass = {
  open: "bg-orange-100 text-orange-700",
  in_progress: "bg-blue-100 text-blue-700",
  processing: "bg-purple-100 text-purple-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

const orderLabel = (request) =>
  request?.order?.order_id ||
  request?.order?.orderId ||
  request?.order?._id ||
  request?.orderId?._id ||
  request?.orderId ||
  "N/A";

const canDeassign = (request) => {
  const order = request?.order;
  const phase = String(order?.deliveryState?.currentPhase || "");
  return (
    ["open", "in_progress"].includes(request?.status) &&
    order?.dispatch?.status === "accepted" &&
    String(order?.dispatch?.deliveryPartnerId || "") ===
      String(request?.deliveryPartner?._id || request?.deliveryPartnerId || "") &&
    ["confirmed", "preparing", "ready_for_pickup", "reached_pickup"].includes(
      String(order?.orderStatus || ""),
    ) &&
    !order?.deliveryState?.pickedUpAt &&
    !["en_route_to_delivery", "at_drop", "delivered", "completed"].includes(
      phase,
    )
  );
};

const canRetryDispatch = (request) =>
  request?.status === "in_progress" &&
  Boolean(request?.deassignedAt) &&
  request?.order?.dispatch?.status === "unassigned";

export default function OrderReassignmentRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const response = await adminAPI.getOrderEmergencyRequests(params);
      setRequests(response?.data?.data?.requests || []);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to load order reassignment requests",
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, status]);

  const deassignAndResend = async (request) => {
    const retryable = canRetryDispatch(request);
    const confirmed = window.confirm(
      retryable
        ? `Retry delivery dispatch for order #${orderLabel(request)}?`
        : `Deassign the current rider from order #${orderLabel(
            request,
          )} and resend it to other eligible delivery partners?`,
    );
    if (!confirmed) return;

    try {
      setActionId(request._id);
      const response = await adminAPI.deassignAndResendEmergencyOrder(
        request._id,
      );
      toast.success(
        response?.data?.message ||
          "Rider deassigned and delivery search restarted",
      );
      await fetchRequests();
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to reassign the order",
      );
      await fetchRequests();
    } finally {
      setActionId(null);
    }
  };

  const markInProgress = async (request) => {
    try {
      setActionId(request._id);
      await adminAPI.updateOrderEmergencyRequest(request._id, {
        status: "in_progress",
      });
      await fetchRequests();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update request");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Order Reassignment Requests
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Emergency requests from riders who cannot collect an accepted
              order.
            </p>
          </div>
          <button
            onClick={fetchRequests}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void fetchRequests();
              }}
              placeholder="Search rider, phone, or reason"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="processing">Processing</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <button
            onClick={fetchRequests}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Search
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center text-slate-500">
            No reassignment requests found.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const eligible = canDeassign(request);
              const retryable = canRetryDispatch(request);
              const isBusy = actionId === request._id;
              return (
                <div
                  key={request._id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-lg font-bold text-slate-900">
                          Order #{orderLabel(request)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            statusClass[request.status] || statusClass.closed
                          }`}
                        >
                          {request.status?.replaceAll("_", " ")}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(request.createdAt).toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
                          <Bike className="mt-0.5 h-5 w-5 text-blue-600" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-400">
                              Delivery partner
                            </p>
                            <p className="text-sm font-semibold text-slate-900">
                              {request.deliveryPartner?.name || "N/A"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {request.deliveryPartner?.phone || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
                          <Store className="mt-0.5 h-5 w-5 text-orange-600" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-400">
                              Restaurant
                            </p>
                            <p className="text-sm font-semibold text-slate-900">
                              {request.restaurant?.restaurantName ||
                                request.restaurant?.name ||
                                "N/A"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Order status:{" "}
                              {request.order?.orderStatus?.replaceAll("_", " ") ||
                                "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                        <div className="mb-2 flex items-center gap-2 text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-bold uppercase">
                            Emergency reason
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-red-900">
                          {request.reason}
                        </p>
                      </div>

                      {request.failureReason && (
                        <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
                          Last attempt: {request.failureReason}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 lg:w-56">
                      {request.status === "open" && (
                        <button
                          onClick={() => markInProgress(request)}
                          disabled={isBusy}
                          className="rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Mark in progress
                        </button>
                      )}
                      <button
                        onClick={() => deassignAndResend(request)}
                        disabled={(!eligible && !retryable) || isBusy}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : request.status === "resolved" ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {retryable ? "Retry Dispatch" : "Deassign & Resend"}
                      </button>
                      {!eligible &&
                        !retryable &&
                        !["resolved", "closed"].includes(request.status) && (
                        <p className="text-xs leading-relaxed text-slate-500">
                          Action is available only while the original rider
                          owns the order and pickup is not completed.
                        </p>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
