import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { useCompanyName } from "@food/hooks/useCompanyName";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

export default function ShowIdCardV2() {
  const companyName = useCompanyName();
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  // Fetch delivery partner profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getProfile();
        
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfileData(response.data.data.profile);
        } else {
          toast.error("Failed to load profile data");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load ID card data");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Format date for validity
  const formatValidDate = () => {
    if (!profileData?.createdAt) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const createdDate = new Date(profileData.createdAt);
    const validTill = new Date(createdDate);
    validTill.setFullYear(validTill.getFullYear() + 1);
    return validTill.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Get status display
  const getStatusDisplay = () => {
    if (!profileData) return "Active";
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Get status color
  const getStatusColor = () => {
    if (!profileData) return "bg-green-500";
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    if (status === 'active' || status === 'approved') return "bg-green-500";
    if (status === 'pending') return "bg-yellow-500";
    if (status === 'suspended' || status === 'blocked') return "bg-red-500";
    return "bg-gray-500";
  };

  // Get profile image URL
  const getProfileImageUrl = () => {
    if (profileData?.profileImage?.url) return profileData.profileImage.url;
    if (profileData?.documents?.photo) return profileData.documents.photo;
    const name = profileData?.name || "Delivery Partner";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ff8100&color=fff&size=128`;
  };

  // Get vehicle display text
  const getVehicleDisplay = () => {
    if (!profileData?.vehicle) return null;
    const vehicle = profileData.vehicle;
    const parts = [];
    if (vehicle.type) parts.push(vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1));
    if (vehicle.number) parts.push(vehicle.number);
    return parts.length > 0 ? parts.join(" - ") : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Failed to load ID card data</p>
          <button onClick={goBack} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Go Back</button>
        </div>
      </div>
    );
  }

  const idCardData = {
    name: profileData.name || "Delivery Partner",
    id: profileData.deliveryId || profileData._id?.toString().slice(-8).toUpperCase() || "N/A",
    phone: profileData.phone || "N/A",
    status: getStatusDisplay(),
    statusColor: getStatusColor(),
    validTill: formatValidDate(),
    vehicle: getVehicleDisplay(),
    profileImage: getProfileImageUrl()
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] relative font-poppins flex flex-col items-center justify-center p-5 pt-16 pb-16">
      
      {/* Top Floating Action Bar */}
      <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-end pb-2 pt-6">
        <button
          onClick={goBack}
          className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>
      </div>

      <div className="w-full max-w-sm relative mt-4">
        {/* The Physical Card */}
        <div className="bg-white rounded-[40px] shadow-[0_20px_60px_rgba(0,0,0,0.06)] border border-gray-100 overflow-hidden relative pb-10">
          
          {/* Card Header Pattern */}
          <div className="h-32 bg-gray-900 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
             <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full -ml-10 -mb-10 blur-xl" />
             <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
          </div>

          {/* Profile Picture (Overlapping) */}
          <div className="absolute top-[48px] left-1/2 -translate-x-1/2 z-10">
            <div className="p-2 bg-white rounded-[36px] shadow-xl">
              <img
                src={idCardData.profileImage}
                alt={idCardData.name}
                className="w-[104px] h-[104px] rounded-[28px] object-cover"
                onError={(e) => {
                  const name = idCardData.name || "Delivery Partner";
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=fff&size=128`;
                }}
              />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="pt-[88px] px-6 relative z-0">
            <div className="flex flex-col items-center text-center">
              {/* Brand Name */}
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500 mb-1">{companyName}</p>

              {/* Delivery Partner Title */}
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-1">PARTNER</h1>
              <h2 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-5">ID CARD</h2>

              {/* Active Status Badge */}
              <div className="mb-8">
                <span className={`px-5 py-2.5 rounded-[16px] text-[10px] font-black uppercase tracking-widest border ${
                  idCardData.status.toLowerCase() === 'active' || idCardData.status.toLowerCase() === 'approved' 
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.1)]'
                  : 'bg-orange-50 text-orange-600 border-orange-100'
                }`}>
                  {idCardData.status}
                </span>
              </div>

              {/* Details Grid */}
              <div className="w-full space-y-3">
                <div className="flex flex-col items-center bg-gray-50/50 p-4 rounded-[28px] border border-gray-100/50">
                   <h3 className="text-xl font-black text-gray-900 tracking-tight mb-0.5">{idCardData.name}</h3>
                   <p className="text-[9px] font-black uppercase text-gray-400 tracking-[0.2em]">Full Name</p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full">
                   <div className="flex flex-col items-center bg-gray-50/50 p-4 rounded-[28px] border border-gray-100/50">
                      <span className="text-sm font-black text-gray-900 tracking-tight mb-0.5">{idCardData.id}</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Partner ID</span>
                   </div>
                   <div className="flex flex-col items-center bg-gray-50/50 p-4 rounded-[28px] border border-gray-100/50">
                      <span className="text-sm font-black text-gray-900 tracking-tight mb-0.5">{idCardData.phone}</span>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mobile</span>
                   </div>
                </div>

                {idCardData.vehicle && (
                  <div className="flex flex-col items-center bg-gray-50/50 p-4 rounded-[28px] border border-gray-100/50">
                     <span className="text-sm font-black text-gray-900 tracking-tight uppercase mb-0.5">{idCardData.vehicle}</span>
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registered Vehicle</span>
                  </div>
                )}

                <div className="pt-6 mt-6 border-t border-dashed border-gray-200">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] leading-relaxed">
                     This ID card is issued for essential delivery services only.<br/>
                     <span className="text-gray-300">Valid Till: {idCardData.validTill}</span>
                   </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
