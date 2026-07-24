import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ArrowLeft, AlertCircle, Upload, Loader2 } from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { toast } from "sonner"

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

const EMPTY_FORM = {
  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifscCode: "",
  upiId: "",
  upiQrImage: "",
}

export default function UpdateBankDetails() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [lastUpdated, setLastUpdated] = useState("")

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [isQrPickerOpen, setIsQrPickerOpen] = useState(false)
  const qrInputRef = useRef(null)

  const formattedUpdatedAt = useMemo(() => {
    if (!lastUpdated) return ""
    const date = new Date(lastUpdated)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }, [lastUpdated])

  const validate = () => {
    const nextErrors = {}
    const accountHolderName = String(form.accountHolderName || "").trim()
    const accountNumber = String(form.accountNumber || "").replace(/\s|-/g, "")
    const confirmAccountNumber = String(form.confirmAccountNumber || "").replace(/\s|-/g, "")
    const ifscCode = String(form.ifscCode || "").trim().toUpperCase()
    const upiId = String(form.upiId || "").trim()

    const anyBankField = Boolean(accountHolderName || accountNumber || ifscCode)

    if (anyBankField) {
      if (!accountHolderName) nextErrors.accountHolderName = "Account holder name is required"
      if (!accountNumber) {
        nextErrors.accountNumber = "Account number is required"
      } else if (!/^\d{9,18}$/.test(accountNumber)) {
        nextErrors.accountNumber = "Account number must be 9 to 18 digits"
      }
      if (!confirmAccountNumber) {
        nextErrors.confirmAccountNumber = "Please confirm account number"
      } else if (confirmAccountNumber !== accountNumber) {
        nextErrors.confirmAccountNumber = "Account numbers do not match"
      }
      if (!ifscCode) {
        nextErrors.ifscCode = "IFSC code is required"
      } else if (!IFSC_REGEX.test(ifscCode)) {
        nextErrors.ifscCode = "Invalid IFSC format (e.g. SBIN0018764)"
      }
    }

    if (upiId && !UPI_REGEX.test(upiId)) {
      nextErrors.upiId = "Invalid UPI ID format (e.g. name@bank)"
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const loadProfile = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getCurrentRestaurant()
      const doc = response?.data?.data?.restaurant || response?.data?.restaurant || null
      if (!doc) return

      const accountNumber = String(doc.accountNumber || "").replace(/\s|-/g, "")
      const upiQrImage =
        typeof doc.upiQrImage === "string"
          ? doc.upiQrImage
          : String(doc.upiQrImage?.url || "")

      setForm({
        accountHolderName: String(doc.accountHolderName || ""),
        accountNumber,
        confirmAccountNumber: accountNumber,
        ifscCode: String(doc.ifscCode || "").toUpperCase(),
        upiId: String(doc.upiId || ""),
        upiQrImage,
      })
      setLastUpdated(doc.updatedAt || "")
    } catch (error) {
      alert(error?.response?.data?.message || "Failed to load bank details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const handleQrUpload = async (file) => {
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size too large. Max 5MB allowed.")
        return
      }
      setUploadingQr(true)
      const response = await uploadAPI.uploadMedia(file, { folder: "food/restaurants/upi-qr" })
      const url =
        response?.data?.data?.url ||
        response?.data?.url ||
        ""
      if (!url) throw new Error("Upload failed")
      setForm((prev) => ({ ...prev, upiQrImage: url }))
      toast.success("QR updated successfully")
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to upload QR image")
    } finally {
      setUploadingQr(false)
    }
  }

  const handleQrClick = () => {
    if (isFlutterBridgeAvailable()) {
      setIsQrPickerOpen(true)
    } else {
      qrInputRef.current?.click()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      accountHolderName: String(form.accountHolderName || "").trim(),
      accountNumber: String(form.accountNumber || "").replace(/\s|-/g, ""),
      ifscCode: String(form.ifscCode || "").trim().toUpperCase(),
      upiId: String(form.upiId || "").trim(),
      upiQrImage: String(form.upiQrImage || "").trim(),
    }

    try {
      setSaving(true)
      await restaurantAPI.updateProfile(payload)
      await loadProfile()
      setErrors({})
      alert("Bank details updated successfully")
    } catch (error) {
      alert(error?.response?.data?.message || "Failed to update bank details")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = (key) =>
    `w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-base transition-colors ${
      errors[key]
        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
        : "border-gray-300 focus:ring-blue-500 focus:border-transparent"
    }`

  return (
    <div className="min-h-screen bg-white flex flex-col md:min-h-full md:h-full md:overflow-hidden md:bg-slate-50">
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur shrink-0">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 md:max-w-2xl md:mx-auto md:px-8 md:py-5 md:w-full">
          <button onClick={goBack} className="p-2 rounded-full hover:bg-gray-100 md:hidden" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 md:text-2xl">Bank & UPI Details</h1>
            <p className="hidden text-sm text-gray-500 md:block">Update payout account and UPI information</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 md:min-h-0 md:max-w-2xl md:mx-auto md:px-8 md:py-8 md:w-full">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading details...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-8 md:shadow-sm">
            <div>
              <p className="hidden md:block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">
                Payouts
              </p>
              <h2 className="text-base font-bold text-gray-900 md:text-lg">Account details</h2>
              {formattedUpdatedAt ? (
                <p className="text-sm text-gray-500 mt-1">Last updated: {formattedUpdatedAt}</p>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account holder name</label>
                <input
                  type="text"
                  value={form.accountHolderName}
                  onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                  className={inputClass("accountHolderName")}
                  placeholder="Enter account holder name"
                />
                {errors.accountHolderName ? (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.accountHolderName}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.accountNumber}
                  onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value.replace(/[^\d\s-]/g, "") }))}
                  className={inputClass("accountNumber")}
                  placeholder="Enter account number"
                />
                {errors.accountNumber ? (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.accountNumber}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.confirmAccountNumber}
                  onChange={(e) => setForm((p) => ({ ...p, confirmAccountNumber: e.target.value.replace(/[^\d\s-]/g, "") }))}
                  className={inputClass("confirmAccountNumber")}
                  placeholder="Re-enter account number"
                />
                {errors.confirmAccountNumber ? (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.confirmAccountNumber}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">IFSC code</label>
                <input
                  type="text"
                  maxLength={11}
                  value={form.ifscCode}
                  onChange={(e) => setForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                  className={inputClass("ifscCode")}
                  placeholder="e.g. SBIN0018764"
                />
                {errors.ifscCode ? (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.ifscCode}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 md:border-slate-200 md:pt-5">
              <h2 className="text-base font-bold text-gray-900 mb-3 md:text-lg">UPI details</h2>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
                  <input
                    type="text"
                    value={form.upiId}
                    onChange={(e) => setForm((p) => ({ ...p, upiId: e.target.value.trim() }))}
                    className={inputClass("upiId")}
                    placeholder="e.g. merchant@okaxis"
                  />
                  {errors.upiId ? (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.upiId}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">UPI QR image</label>
                  {form.upiQrImage ? (
                    <img
                      src={form.upiQrImage}
                      alt="UPI QR"
                      className="w-40 h-40 object-contain border border-gray-200 rounded-lg bg-white"
                    />
                  ) : (
                    <div className="w-40 h-40 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500">
                      No QR uploaded
                    </div>
                  )}

                  <div
                    onClick={handleQrClick}
                    className="inline-flex mt-3 items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium cursor-pointer hover:bg-gray-50"
                  >
                    {uploadingQr ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload QR Image
                      </>
                    )}
                    <input
                      ref={qrInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingQr}
                      onChange={(e) => handleQrUpload(e.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || uploadingQr}
              className="w-full disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg text-base transition-colors md:mt-2"
              style={{
                background: saving || uploadingQr
                  ? "rgb(96 165 250)"
                  : "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
                boxShadow: saving || uploadingQr ? "none" : "0 10px 22px rgba(var(--module-theme-rgb,37,99,235),0.28)",
              }}
            >
              {saving ? "Saving..." : "Submit"}
            </button>
          </form>
        )}
      </div>
      
      <ImageSourcePicker
        isOpen={isQrPickerOpen}
        onClose={() => setIsQrPickerOpen(false)}
        onFileSelect={handleQrUpload}
        title="Upload UPI QR"
        description="Choose how to upload your bank UPI QR image"
        fileNamePrefix="upi-qr"
        galleryInputRef={qrInputRef}
      />
    </div>
  )
}
