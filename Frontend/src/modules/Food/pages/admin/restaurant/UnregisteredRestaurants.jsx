import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search, Trash2, Building2, User, Phone, Mail, MapPin, Calendar, 
  UtensilsCrossed, ArrowUpDown, Loader2, RefreshCw, AlertCircle, Eye, X
} from "lucide-react";
import { adminAPI } from "@food/api";

export default function UnregisteredRestaurants() {
  const [searchQuery, setSearchQuery] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForView, setSelectedForView] = useState(null);
  const [showViewDialog, setShowViewDialog] = useState(false);

  // Track first render to avoid duplicate fetch in StrictMode
  const hasFetchedOnceRef = useRef(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getUnregisteredRestaurants();
      const list = response?.data?.data || [];
      setRestaurants(list);
    } catch (err) {
      console.error("Error fetching unregistered restaurants:", err);
      setError(err.message || "Failed to fetch unregistered restaurants");
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetchedOnceRef.current) {
      hasFetchedOnceRef.current = true;
      fetchRequests();
    }
  }, []);

  const filteredRestaurants = useMemo(() => {
    let filtered = restaurants;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          r.restaurantName?.toLowerCase().includes(query) ||
          r.ownerName?.toLowerCase().includes(query) ||
          r.mobileNumber?.includes(query) ||
          r.emailId?.toLowerCase().includes(query) ||
          r.location?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [restaurants, searchQuery]);

  const handleDeleteClick = (restaurant) => {
    setSelectedForDelete(restaurant);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedForDelete) return;

    try {
      setProcessing(true);
      await adminAPI.deleteUnregisteredRestaurant(selectedForDelete._id);
      
      // Refresh list
      await fetchRequests();
      
      setShowDeleteDialog(false);
      setSelectedForDelete(null);
      alert("Lead request deleted successfully!");
    } catch (err) {
      console.error("Error deleting lead request:", err);
      alert(err.response?.data?.message || "Failed to delete request. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 shadow-inner">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Unregistered Restaurant Leads</h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage partner registration inquiries submitted from the homepage</p>
            </div>
          </div>
          <button
            onClick={fetchRequests}
            className="self-start md:self-auto px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats / Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Leads Received</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">{restaurants.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
              <Building2 className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Search Matches</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">{filteredRestaurants.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Search className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm sm:col-span-2 lg:col-span-1 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Lead Status</p>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-700 text-xs font-semibold rounded-full mt-3">
                <AlertCircle className="w-3.5 h-3.5" />
                Action Required
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <User className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="relative max-w-md w-full">
            <input
              type="text"
              placeholder="Search by restaurant name, owner, phone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 pr-4 py-3 w-full text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 text-slate-800"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto mt-6 rounded-xl border border-slate-100">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-16">
                    <div className="flex items-center gap-1">
                      <span>SL</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Restaurant Details</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Contact Info</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Location</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Submitted On</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-600">Retrieving partner inquiries...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <div className="max-w-md mx-auto p-4 rounded-xl bg-red-555/10 border border-red-200 text-red-700">
                        <p className="text-sm font-semibold">Error loading leads: {error}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Building2 className="w-12 h-12 mb-3 text-slate-300" />
                        <p className="text-base font-semibold text-slate-600">No Lead Entries Found</p>
                        <p className="text-sm text-slate-400 mt-1">There are no registration requests that match your criteria</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((request, index) => (
                    <tr key={request._id || index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-500">{request.sl ?? index + 1}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 shrink-0">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-slate-900 block">{request.restaurantName}</span>
                            <span className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3 text-slate-400" />
                              {request.ownerName}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col space-y-1">
                          <span className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {request.mobileNumber || "N/A"}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {request.emailId || "N/A"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-start gap-1.5 max-w-xs">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-600 line-clamp-2">{request.location || "N/A"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className="text-sm text-slate-600 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {formatDate(request.createdAt)}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedForView(request);
                              setShowViewDialog(true);
                            }}
                            className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(request)}
                            className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title="Delete Lead inquiry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteDialog && selectedForDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete Partner Lead</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Action is permanent and cannot be undone</p>
                </div>
              </div>
              
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Are you sure you want to permanently delete the lead inquiries for <strong className="text-slate-800">{selectedForDelete.restaurantName}</strong> ({selectedForDelete.ownerName})?
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setSelectedForDelete(null);
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Lead"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewDialog && selectedForView && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => { setShowViewDialog(false); setSelectedForView(null); }}>
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden transform transition-all duration-300 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Lead Inquiry Details</h3>
                  <p className="text-xs text-slate-500">Submitted by restaurant partner</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowViewDialog(false);
                  setSelectedForView(null);
                }}
                className="w-8 h-8 rounded-full bg-white/80 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Restaurant Name</span>
                  <span className="text-sm font-semibold text-slate-800 block break-words">{selectedForView.restaurantName}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Owner Name</span>
                  <span className="text-sm font-semibold text-slate-800 block break-words">{selectedForView.ownerName}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mobile Number</span>
                    <span className="text-sm font-medium text-slate-800">{selectedForView.mobileNumber || "N/A"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</span>
                    <span className="text-sm font-medium text-slate-800 break-all">{selectedForView.emailId || "N/A"}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center text-[#FA0272] shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Location / Address</span>
                    <span className="text-sm font-medium text-slate-800 leading-relaxed break-words">{selectedForView.location || "N/A"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Submitted On</span>
                    <span className="text-sm font-medium text-slate-800">{formatDate(selectedForView.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => {
                  setShowViewDialog(false);
                  setSelectedForView(null);
                }}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-all rounded-xl shadow-sm"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
