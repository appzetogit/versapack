import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  User, ArrowRight, Bike, Ticket, ChevronRight, 
  Share2, LogOut, X, Loader2, Briefcase, Trash2, HelpCircle, History, ArrowLeft
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { deliveryAPI } from "@food/api"
import DeleteAccountModal from "@food/components/DeleteAccountModal";
import { toast } from "sonner"
import { clearModuleAuth } from "@food/utils/auth"
import { logoutDeliverySession } from "@food/utils/moduleLogout"
import useDeliveryBackNavigation from "../hooks/useDeliveryBackNavigation";

export const ProfileV2 = () => {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile)
        }
      } catch (error) {
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
    deliveryAPI.getWallet().then(res => {
      const wallet = res?.data?.data?.wallet || {};
      const pendingWithdrawals = Number(wallet.pendingWithdrawals ?? wallet.pending_withdrawals) || 0;
      const lockedAmount = Number(wallet.lockedAmount ?? wallet.locked_amount) || 0;
      const availableWalletBalance = Math.max(0, (Number(wallet.balance) || 0) - Math.max(lockedAmount, pendingWithdrawals));
      const bal = wallet?.pocketBalance ?? availableWalletBalance ?? wallet?.totalBalance ?? 0;
      setWalletBalance(Number(bal));
    }).catch(() => {});
  }, [])

  useEffect(() => {
    deliveryAPI.getReferralStats().then((res) => {
      const reward = res?.data?.data?.stats?.rewardAmount
      setReferralReward(Number(reward) || 0)
    }).catch(() => {})
  }, [])

  const refId = profile?._id || profile?.id || profile?.referralCode || ""
  const referralLink = refId ? `${window.location.origin}/food/delivery/signup?ref=${encodeURIComponent(String(refId))}` : ""

  const handleShareReferral = async () => {
    if (!referralLink) return
    const rewardText = referralReward > 0 ? `₹${referralReward}` : "rewards"
    const shareText = `Join as a delivery partner and earn ${rewardText}.`
    try {
      if (navigator.share) {
        await navigator.share({ title: "Delivery referral", text: shareText, url: referralLink })
      } else {
        const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
        window.open(fallbackUrl, "_blank", "noopener,noreferrer")
      }
    } catch (e) {}
  }

  const handleConfirmDelete = async () => {
    try {
      await deliveryAPI.deleteAccount();
      toast.success("Account deleted successfully");
      clearModuleAuth("delivery");
      localStorage.removeItem("app:isOnline");
      navigate("/food/delivery/login", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete account");
    }
  };

  const handleLogout = async () => {
    if (logoutSubmitting) return
    setShowLogoutConfirm(false)
    try {
      setLogoutSubmitting(true)
      await logoutDeliverySession({ navigate })
      toast.success("Logged out successfully")
    } catch (error) {
      clearModuleAuth("delivery")
      localStorage.removeItem("app:isOnline")
      navigate("/food/delivery/login", { replace: true })
    } finally {
      setLogoutSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-poppins pb-32">
         <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading Profile...</span>
         </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 font-poppins pb-32">
      <div className="sticky top-0 z-[100] bg-[#f8f9fa]/90 backdrop-blur-xl border-b border-gray-100 px-4 py-4 pt-8 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={goBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-900 border border-gray-200 shadow-sm active:scale-95 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tighter">PROFILE</h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Your Milestones</p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Profile Header Block (Clean White Edge-to-Edge) */}
      <div className="bg-white px-6 py-6 pb-8 border-b border-gray-100 rounded-b-[40px] shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
        <div 
          onClick={() => navigate("/food/delivery/profile/details")}
          className="flex items-center justify-between cursor-pointer group"
        >
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-3xl font-black tracking-tight text-gray-900">{profile?.name || "Partner"}</h2>
              <ChevronRight className="w-5 h-5 text-gray-300 group-active:translate-x-1 transition-transform" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--module-theme-color, #00B761)" }}>{profile?.deliveryId || "ID NOT FOUND"}</p>
          </div>
          <div className="relative shrink-0">
            {profile?.profileImage?.url ? (
              <img src={profile.profileImage.url} alt="Profile" className="w-[88px] h-[88px] rounded-[32px] object-cover shadow-sm border border-gray-100" />
            ) : (
              <div className="w-[88px] h-[88px] rounded-[32px] bg-gray-50 flex items-center justify-center border border-gray-100 shadow-inner">
                <User className="w-10 h-10 text-gray-300" />
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 bg-white rounded-xl p-2.5 shadow-md border border-gray-100 text-gray-900">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        
        {/* Navigation Buttons */}
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => navigate("/food/delivery/history")}
            className="bg-white rounded-[28px] p-5 flex items-center gap-4 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:scale-[0.98] transition-all group"
          >
            <div
              className="w-14 h-14 rounded-[20px] flex items-center justify-center border transition-colors"
              style={{
                backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                color: "var(--module-theme-color, #00B761)",
              }}
            >
              <History className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
               <span className="block text-base font-bold text-gray-900 mb-0.5">Trips History</span>
               <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">View your deliveries</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Share & Earn Card */}
        <div className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] flex flex-col gap-5 relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"
            style={{ backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.12)" }}
          />
          <div className="relative z-10 flex items-start justify-between gap-4">
             <div>
               <h3 className="text-lg font-black text-gray-900 mb-1">
                 Share & Earn
               </h3>
               <p className="text-gray-500 text-xs font-medium leading-relaxed max-w-[200px]">
                 Invite friends to join the delivery partner fleet{referralReward > 0 ? ` and get ₹${referralReward}` : ""}.
               </p>
             </div>
             <div
               className="w-12 h-12 rounded-[20px] flex items-center justify-center border shrink-0"
               style={{
                 backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                 borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                 color: "var(--module-theme-color, #00B761)",
               }}
             >
                <Share2 className="w-5 h-5" />
             </div>
          </div>
          <button
            onClick={handleShareReferral}
            className="relative z-10 w-full text-white py-4 rounded-[20px] text-[11px] font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
            style={{
              background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 0,183,97), 0.88), var(--module-theme-color, #00B761))",
              boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 0,183,97), 0.30)",
            }}
          >
            Share Link
          </button>
        </div>

        {/* Support & Legal Section */}
        <div className="space-y-3">
          <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-2">Support & Legal</h3>
          
          <div 
            onClick={() => navigate("/food/delivery/help/tickets")}
            className="bg-white rounded-[24px] p-5 flex items-center justify-between cursor-pointer border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center border"
                style={{
                  backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                  borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                  color: "var(--module-theme-color, #00B761)",
                }}
              >
                 <HelpCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-gray-900">Support Tickets</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </div>
        </div>

        {/* Danger Zone Section */}
        <div className="space-y-3 pt-2">
          <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-2">Danger Zone</h3>
          
          <div 
            onClick={() => setDeleteModalOpen(true)}
            className="bg-white rounded-[24px] p-5 flex items-center justify-between cursor-pointer border border-red-50 hover:bg-red-50/50 active:bg-red-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                 <Trash2 className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-red-600">Delete Account</span>
            </div>
            <ArrowRight className="w-4 h-4 text-red-200" />
          </div>

          <div 
            onClick={() => setShowLogoutConfirm(true)}
            className="bg-white rounded-[24px] p-5 flex items-center justify-between cursor-pointer border border-red-50 hover:bg-red-50/50 active:bg-red-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                 <LogOut className="w-5 h-5 ml-1" />
              </div>
              <span className="text-sm font-bold text-red-600">Log Out</span>
            </div>
            <ArrowRight className="w-4 h-4 text-red-200" />
          </div>
        </div>
      </div>

      {/* Logout Confirm Popup - Modernized */}
      <AnimatePresence>
         {showLogoutConfirm && (
           <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center px-4 pb-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLogoutConfirm(false)} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
             <motion.div 
               initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-6 relative z-10"
               onClick={(e) => e.stopPropagation()}
             >
               <div className="w-16 h-16 bg-red-50 rounded-[24px] flex items-center justify-center mx-auto mb-5 border border-red-100">
                  <LogOut className="w-8 h-8 text-red-500 ml-1" />
               </div>
               <h3 className="text-xl font-black text-gray-900 text-center mb-2 tracking-tight">Log out?</h3>
               <p className="text-sm font-medium text-gray-500 text-center mb-8">You will be signed out from your delivery account and won't receive new orders.</p>
               <div className="flex flex-col gap-3">
                 <button
                   onClick={handleLogout}
                   disabled={logoutSubmitting}
                   className="w-full h-14 rounded-[20px] bg-red-500 text-white font-black text-[11px] uppercase tracking-widest shadow-md shadow-red-500/20 active:scale-[0.98] transition-all disabled:opacity-60"
                 >
                   {logoutSubmitting ? "Logging out..." : "Yes, Log out"}
                 </button>
                 <button
                   onClick={() => setShowLogoutConfirm(false)}
                   className="w-full h-14 rounded-[20px] bg-gray-50 text-gray-900 font-black text-[11px] uppercase tracking-widest active:scale-[0.98] transition-all"
                 >
                   Cancel
                 </button>
               </div>
             </motion.div>
           </div>
         )}
      </AnimatePresence>

      <DeleteAccountModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={handleConfirmDelete} 
        walletAmount={walletBalance} 
        moduleName="delivery" 
      />
    </div>
  );
};

export default ProfileV2;
