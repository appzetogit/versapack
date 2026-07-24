import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit2, Loader2, Save } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * ProfileBankV2 - Restored Old UI for Bank Details.
 */
export const ProfileBankV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    panNumber: "",
    upiId: ""
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success) {
           const profile = response.data.data.profile;
           setForm({
              accountHolderName: profile?.documents?.bankDetails?.accountHolderName || "",
              accountNumber: profile?.documents?.bankDetails?.accountNumber || "",
              ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
              bankName: profile?.documents?.bankDetails?.bankName || "",
              panNumber: profile?.documents?.pan?.number || "",
              upiId: profile?.documents?.bankDetails?.upiId || ""
           });
        }
      } catch (e) { toast.error("Failed to load details"); }
      finally { setLoading(false); }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
     // Validation checks
     if (!form.accountHolderName.trim()) return toast.error("Account holder name is required");
     if (!/^[a-zA-Z\s]+$/.test(form.accountHolderName)) return toast.error("Account holder name should only contain alphabets");
     
     if (!form.accountNumber) return toast.error("Account number is required");
     if (!/^\d+$/.test(form.accountNumber)) return toast.error("Account number should only contain digits");
     if (form.accountNumber.length < 9 || form.accountNumber.length > 18) return toast.error("Invalid account number length");

     if (!form.ifscCode) return toast.error("IFSC code is required");
     if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) return toast.error("Invalid IFSC code format (e.g., SBIN0012345)");

     if (!form.bankName.trim()) return toast.error("Bank name is required");
     if (!/^[a-zA-Z\s]+$/.test(form.bankName)) return toast.error("Bank name should only contain alphabets");

     if (form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber)) {
        return toast.error("Invalid PAN number format");
     }

     if (form.upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(form.upiId)) {
        return toast.error("Invalid UPI ID format (e.g., name@bank)");
     }

     setIsSaving(true);
     try {
        const payload = {
           documents: {
              bankDetails: {
                 accountHolderName: form.accountHolderName.trim(),
                 accountNumber: form.accountNumber,
                 ifscCode: form.ifscCode,
                 bankName: form.bankName.trim(),
                 upiId: form.upiId.trim()
              },
              pan: { number: form.panNumber }
           }
        };
        const response = await deliveryAPI.updateProfileDetails(payload);
        if (response?.data?.success) {
           toast.success("Bank details updated");
           setIsEditing(false);
        }
     } catch (e) { toast.error("Update failed"); }
     finally { setIsSaving(false); }
  };

  const onInputChange = (key, value) => {
    let sanitized = value;
    if (key === 'accountHolderName' || key === 'bankName') {
      sanitized = value.replace(/[^a-zA-Z\s]/g, '');
    } else if (key === 'accountNumber') {
      sanitized = value.replace(/\D/g, '');
    } else if (key === 'ifscCode' || key === 'panNumber') {
      sanitized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (key === 'ifscCode') sanitized = sanitized.slice(0, 11);
      if (key === 'panNumber') sanitized = sanitized.slice(0, 10);
    } else if (key === 'upiId') {
      sanitized = value.toLowerCase().trim();
    }
    setForm({ ...form, [key]: sanitized });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
       <div className="bg-white px-4 py-5 flex items-center gap-4 fixed top-0 w-full z-50 shadow-sm">
          <button onClick={goBack}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-black">Bank Details</h1>
          {!isEditing && (
             <button onClick={() => setIsEditing(true)} className="ml-auto p-2 bg-orange-50 text-orange-600 rounded-xl"><Edit2 className="w-4 h-4" /></button>
          )}
       </div>

       <div className="pt-24 px-4 pb-10 space-y-6">
          <div className="space-y-4">
             {Object.entries({
                "Account Holder": "accountHolderName",
                "Account Number": "accountNumber",
                "IFSC Code": "ifscCode",
                "Bank Name": "bankName",
                "PAN Number": "panNumber",
                "UPI ID": "upiId"
             }).map(([label, key]) => (
                <div key={key} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{label}</label>
                   {isEditing ? (
                      <input 
                         type="text" 
                         value={form[key]}
                         onChange={(e) => onInputChange(key, e.target.value)}
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-950 focus:ring-2 focus:ring-orange-500/20"
                      />
                   ) : (
                      <p className="text-sm font-bold text-gray-950">{form[key] || "Not provided"}</p>
                   )}
                </div>
             ))}
          </div>

          {isEditing && (
             <button 
               onClick={handleSave}
               disabled={isSaving}
               className="w-full bg-black text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
             >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
             </button>
          )}
       </div>
    </div>
  );
};
