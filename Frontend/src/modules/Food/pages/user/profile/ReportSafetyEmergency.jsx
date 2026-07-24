import { Link } from "react-router-dom"
import { ArrowLeft, AlertTriangle, Phone, Shield, Loader2 } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { Textarea } from "@food/components/ui/textarea"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { userAPI } from "@food/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function ReportSafetyEmergency() {
  const [report, setReport] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true)
      const res = await userAPI.getMySafetyEmergencyReports({ page: 1, limit: 20 })
      const list = res?.data?.data?.safetyEmergencies ?? []
      setHistory(Array.isArray(list) ? list : [])
    } catch (err) {
      debugError("Error fetching safety emergency history:", err)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const historySorted = useMemo(() => {
    const arr = Array.isArray(history) ? [...history] : []
    arr.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    return arr
  }, [history])

  const getStatusPill = (status) => {
    const map = {
      unread: "bg-blue-100 text-blue-700",
      read: "bg-slate-100 text-slate-700",
      urgent: "bg-red-100 text-red-700",
      resolved: "bg-green-100 text-green-700",
    }
    const cls = map[String(status)] || map.unread
    const label = String(status || "unread").replace(/^\w/, (c) => c.toUpperCase())
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
  }

  const getPriorityPill = (priority) => {
    const map = {
      low: "bg-gray-100 text-gray-700",
      medium: "bg-yellow-100 text-yellow-700",
      high: "bg-orange-100 text-orange-700",
      critical: "bg-red-100 text-red-700 font-bold",
    }
    const cls = map[String(priority)] || map.medium
    const label = String(priority || "medium").replace(/^\w/, (c) => c.toUpperCase())
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
  }

  const formatDateTime = (iso) => {
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ""
      return d.toLocaleString()
    } catch {
      return ""
    }
  }

  const handleSubmit = async () => {
    const trimmedReport = report.trim()
    
    if (!trimmedReport) {
      toast.error('Please describe the safety concern or emergency')
      return
    }

    // Check for at least 5 words
    const words = trimmedReport.split(/\s+/).filter(word => word.length > 0)
    if (words.length < 5) {
      toast.error('Please provide a more detailed report (minimum 5 words)')
      return
    }

    try {
      setIsSubmitting(true)
      const response = await userAPI.createSafetyEmergencyReport(trimmedReport)
      
      if (response.data.success) {
        setIsSubmitted(true)
        setReport("")
        toast.success('Safety emergency report submitted successfully!')
        fetchHistory()
        setTimeout(() => {
          setIsSubmitted(false)
        }, 5000)
      }
    } catch (error) {
      debugError('Error submitting safety emergency report:', error)
      toast.error(error.response?.data?.message || 'Failed to submit safety emergency report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenHistoryDetails = (item) => {
    setSelectedHistoryItem(item)
    setIsHistoryDialogOpen(true)
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] pb-24 md:pb-0">
      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 lg:mb-8">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 p-0">
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-black dark:text-white">Report a safety emergency</h1>
        </div>

        {/* Emergency Contact Card */}
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 rounded-xl shadow-sm mb-4 md:mb-5 lg:mb-6">
          <CardContent className="p-4 md:p-5 lg:p-6">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="bg-red-100 dark:bg-red-900/40 rounded-full p-2 md:p-3 mt-0.5">
                <Phone className="h-5 w-5 md:h-6 md:w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base md:text-lg lg:text-xl font-semibold text-red-900 dark:text-red-200 mb-1 md:mb-2">
                  Emergency Contact
                </h3>
                <p className="text-sm md:text-base text-red-700 dark:text-red-300 mb-3 md:mb-4">
                  For immediate emergencies, please call your local emergency services.
                </p>
                <a
                  href="tel:100"
                  className="text-red-600 dark:text-red-400 font-semibold text-base md:text-lg lg:text-xl hover:underline"
                >
                  Emergency: 100
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {!isSubmitted ? (
          <>
            {/* Info Card */}
            <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800 mb-4 md:mb-5 lg:mb-6">
              <CardContent className="p-4 md:p-5 lg:p-6">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-2 md:p-3 mt-0.5">
                    <Shield className="h-5 w-5 md:h-6 md:w-6 text-gray-700 dark:text-gray-300" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base md:text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-1 md:mb-2">
                      Safety is our priority
                    </h3>
                    <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                      Report any safety concerns, incidents, or emergencies related to your order or delivery experience.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Report Form */}
            <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800 mb-4 md:mb-5 lg:mb-6">
              <CardContent className="p-4 md:p-5 lg:p-6">
                <label className="block text-sm md:text-base font-medium text-gray-900 dark:text-white mb-2 md:mb-3">
                  Describe the safety concern or emergency
                </label>
                <Textarea
                  placeholder="Please provide details about the safety issue..."
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  className="min-h-[150px] md:min-h-[200px] lg:min-h-[250px] w-full resize-y text-sm md:text-base leading-relaxed"
                  dir="ltr"
                />
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {report.length} characters
                </p>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!report.trim() || isSubmitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-sm md:text-base h-10 md:h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Report Safety Issue'
              )}
            </Button>

            {/* History */}
            <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800 mt-5 md:mt-6">
              <CardContent className="p-4 md:p-5 lg:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                    Your report history
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    className="h-8"
                  >
                    {historyLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading
                      </>
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                </div>

                {historyLoading && historySorted.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                    Loading your reports...
                  </p>
                ) : historySorted.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                    No reports yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {historySorted.map((item) => (
                      <button
                        type="button"
                        key={item?._id || item?.id || `${item?.createdAt}-${item?.message?.slice?.(0, 12)}`}
                        onClick={() => handleOpenHistoryDetails(item)}
                        className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 md:p-4 bg-gray-50 dark:bg-[#101010] hover:bg-gray-100 dark:hover:bg-[#141414] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm md:text-base font-medium text-gray-900 dark:text-white truncate">
                              {item?.message || "—"}
                            </p>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {formatDateTime(item?.createdAt)}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {getStatusPill(item?.status)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* History Details Dialog - Redesigned for professional look */}
            <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
              <DialogContent className="max-w-[90vw] md:max-w-xl p-0 overflow-hidden border-0 rounded-3xl shadow-2xl bg-white dark:bg-[#121212]">
                <div className="bg-red-600 p-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl">
                      <AlertTriangle className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Report Details</h2>
                      <p className="text-red-100 text-xs">Safety Emergency Feedback</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status:</span>
                      {getStatusPill(selectedHistoryItem?.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Priority:</span>
                      {selectedHistoryItem?.priority ? getPriorityPill(selectedHistoryItem?.priority) : getPriorityPill('medium')}
                    </div>
                    {selectedHistoryItem?.createdAt && (
                      <div className="ml-auto text-[11px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">
                        {formatDateTime(selectedHistoryItem.createdAt)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Detailed Report</p>
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-red-600/10 to-orange-600/10 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                      <div className="relative rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#0a0a0a] p-5 shadow-sm">
                        <p className="text-base text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed font-medium italic">
                          "{selectedHistoryItem?.message || "—"}"
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedHistoryItem?.adminResponse && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield className="w-3 h-3" /> Official Support Response
                      </p>
                      <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-900/10 p-5 shadow-sm">
                        <p className="text-base text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap leading-relaxed font-semibold">
                          {selectedHistoryItem.adminResponse}
                        </p>
                        {selectedHistoryItem?.respondedAt && (
                          <p className="text-[10px] text-emerald-700/60 dark:text-emerald-400/60 mt-4 font-bold uppercase tracking-tighter">
                            Verified Response • {formatDateTime(selectedHistoryItem.respondedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/50 dark:bg-[#0a0a0a]">
                  <Button 
                    onClick={() => setIsHistoryDialogOpen(false)}
                    className="rounded-xl px-8 bg-black text-white hover:bg-gray-900 transition-all active:scale-95"
                  >
                    Got it
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          /* Success State */
          <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-md border-0 dark:border-gray-800 overflow-hidden">
            <CardContent className="p-6 md:p-8 lg:p-10 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-5 lg:mb-6">
                <AlertTriangle className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2 md:mb-3">Report Submitted</h2>
              <p className="text-sm md:text-base lg:text-lg text-gray-600 dark:text-gray-400 mb-3 md:mb-4">
                Your safety report has been submitted. Our team will review it immediately and take appropriate action.
              </p>
              <p className="text-xs md:text-sm text-red-600 dark:text-red-400 font-medium">
                If this is a life-threatening emergency, please call 100 immediately.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AnimatedPage>
  )
}


