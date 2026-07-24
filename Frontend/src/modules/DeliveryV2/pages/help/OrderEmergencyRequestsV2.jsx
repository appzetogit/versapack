import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { deliveryAPI } from "@food/api";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

const getOrderId = (order) =>
  order?.order_id || order?.orderId || order?._id || "N/A";

const statusClass = {
  open: "bg-orange-50 text-orange-700 border-orange-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  processing: "bg-purple-50 text-purple-700 border-purple-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
  closed: "bg-gray-50 text-gray-600 border-gray-200",
};

export const OrderEmergencyRequestsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [activeOrder, setActiveOrder] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [currentResponse, requestsResponse] = await Promise.all([
        deliveryAPI.getCurrentDelivery(),
        deliveryAPI.getOrderEmergencyRequests(),
      ]);
      setActiveOrder(
        currentResponse?.data?.data?.activeOrder ||
          currentResponse?.data?.data ||
          null,
      );
      setRequests(requestsResponse?.data?.data?.requests || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const orderStatus = String(activeOrder?.orderStatus || "").toLowerCase();
  const currentPhase = String(
    activeOrder?.deliveryState?.currentPhase || "",
  ).toLowerCase();
  const canRequest =
    activeOrder?.dispatch?.status === "accepted" &&
    ["confirmed", "preparing", "ready_for_pickup", "reached_pickup"].includes(
      orderStatus,
    ) &&
    !activeOrder?.deliveryState?.pickedUpAt &&
    !["en_route_to_delivery", "at_drop", "delivered", "completed"].includes(
      currentPhase,
    );
  const hasActiveRequest = requests.some((request) =>
    ["open", "in_progress", "processing"].includes(request.status),
  );

  const submitRequest = async () => {
    if (reason.trim().length < 10) {
      toast.error("Please explain the emergency in at least 10 characters");
      return;
    }

    try {
      setSubmitting(true);
      await deliveryAPI.createOrderEmergencyRequest({ reason: reason.trim() });
      toast.success("Emergency reassignment request sent to admin");
      setReason("");
      await loadData();
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to send emergency request",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f8] pb-12 font-poppins">
      <div className="sticky top-0 z-40 flex items-center gap-4 border-b border-gray-100 bg-white px-4 py-5">
        <button
          onClick={goBack}
          className="rounded-full p-1 hover:bg-gray-50"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6 text-gray-950" />
        </button>
        <div>
          <h1 className="text-lg font-black text-gray-950">
            Active Order Emergency
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Request delivery reassignment
          </p>
        </div>
      </div>

      <div className="space-y-5 px-4 pt-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-950">
                  Current order
                </h2>
                <button
                  onClick={loadData}
                  className="rounded-xl bg-gray-50 p-2 text-gray-500"
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {activeOrder ? (
                <div className="space-y-2 rounded-2xl bg-gray-50 p-4">
                  <p className="text-base font-black text-gray-950">
                    Order #{getOrderId(activeOrder)}
                  </p>
                  <p className="text-xs font-semibold text-gray-600">
                    {activeOrder?.restaurantId?.restaurantName ||
                      activeOrder?.restaurantId?.name ||
                      activeOrder?.restaurantName ||
                      "Restaurant"}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
                    {orderStatus.replaceAll("_", " ")}
                  </p>
                </div>
              ) : (
                <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500">
                  No accepted active order found.
                </p>
              )}

              {canRequest && !hasActiveRequest ? (
                <div className="mt-5 space-y-3">
                  <div className="flex gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <p className="text-xs font-semibold leading-relaxed text-red-800">
                      Use this only when an emergency prevents you from
                      collecting the order. This option closes after pickup.
                    </p>
                  </div>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={5}
                    placeholder="Explain what happened..."
                    className="w-full resize-none rounded-2xl border border-gray-200 bg-white p-4 text-sm font-semibold outline-none focus:border-orange-400"
                  />
                  <button
                    onClick={submitRequest}
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 p-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                    Send emergency request
                  </button>
                </div>
              ) : hasActiveRequest ? (
                <div className="mt-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <CheckCircle className="h-5 w-5 shrink-0 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800">
                    Your request is with the admin. Keep the order open until
                    the reassignment confirmation arrives.
                  </p>
                </div>
              ) : activeOrder ? (
                <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-xs font-semibold text-gray-600">
                  Emergency reassignment is unavailable after food pickup.
                </p>
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="px-1 text-xs font-black uppercase tracking-widest text-gray-500">
                Request history
              </h2>
              {requests.length === 0 ? (
                <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center text-sm font-semibold text-gray-400">
                  No reassignment requests yet.
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request._id}
                    className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-950">
                          Order #{getOrderId(request.order)}
                        </p>
                        <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600">
                          {request.reason}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${
                          statusClass[request.status] || statusClass.closed
                        }`}
                      >
                        {request.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    {request.adminResponse && (
                      <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-xs font-semibold text-blue-800">
                        Admin: {request.adminResponse}
                      </p>
                    )}
                    {request.failureReason && (
                      <p className="mt-3 text-xs font-semibold text-red-600">
                        {request.failureReason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};
