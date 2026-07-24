import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Lock, Loader2, Mail, Phone, MessageSquare, Clock, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import api from "@food/api"

export default function DeliveryCMSPage({ endpoint, title: defaultTitle, module = "DELIVERY" }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [pageData, setPageData] = useState({
    title: defaultTitle,
    content: '',
    email: '',
    mobile: ''
  })

  useEffect(() => {
    fetchPageData()
  }, [endpoint, module])

  const fetchPageData = async () => {
    try {
      setLoading(true)
      console.log(`[CMS] Fetching: ${endpoint}?module=${module}`)
      
      const response = await api.get(endpoint, {
        params: { module }
      })
      
      console.log(`[CMS] Response for ${endpoint}:`, response.data)
      
      const data = response.data?.data || response.data
      
      if (data && typeof data === 'object') {
        // If data is the legal object directly
        if ('content' in data) {
          setPageData({
            title: data.title || defaultTitle,
            content: data.content || '',
            email: data.email || '',
            mobile: data.mobile || ''
          })
        } 
        // If data is the result object from service { key, module, data: { ... } }
        else if (data.data && typeof data.data === 'object' && 'content' in data.data) {
          setPageData({
            title: data.data.title || defaultTitle,
            content: data.data.content || '',
            email: data.data.email || '',
            mobile: data.data.mobile || ''
          })
        }
      }
    } catch (error) {
      console.error(`[CMS] Error fetching data for ${endpoint}:`, error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#E23744]" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] overflow-x-hidden">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{pageData.title || defaultTitle}</h1>
      </div>

      <div className="w-full px-5 py-6">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            {/* Support Specific Header Cards */}
            {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <div className="bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-2xl border border-gray-100 dark:border-zinc-800 flex flex-col items-center text-center group transition-all hover:border-[#E23744]/30">
                  <div className="w-12 h-12 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    <Mail className="w-6 h-6 text-[#E23744]" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">Partner Email</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{pageData.email || 'delivery@switcheats.com'}</p>
                  <a href={`mailto:${pageData.email || 'delivery@switcheats.com'}`} className="mt-4 text-[10px] font-black text-[#E23744] uppercase tracking-widest hover:underline">Write to us</a>
                </div>
                <div className="bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-2xl border border-gray-100 dark:border-zinc-800 flex flex-col items-center text-center group transition-all hover:border-[#E23744]/30">
                  <div className="w-12 h-12 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    <Phone className="w-6 h-6 text-[#E23744]" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">Partner Support</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{pageData.mobile || '+91 00000 00000'}</p>
                  <a href={`tel:${pageData.mobile}`} className="mt-4 text-[10px] font-black text-[#E23744] uppercase tracking-widest hover:underline">Request Call</a>
                </div>
              </div>
            )}

            {pageData.content ? (
              <div
                className="prose prose-sm prose-orange dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: pageData.content }}
              />
            ) : (
              <div className="text-center py-20">
                <Lock className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
                <p className="text-gray-400 font-medium">No additional content available at the moment.</p>
              </div>
            )}

            {/* Professional Static Content for Delivery Support */}
            {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
              <div className="mt-12 pt-10 border-t border-gray-100 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-8 tracking-tight">Delivery Partner FAQs</h2>
                <div className="grid gap-6">
                  {[
                    { q: "How are earnings calculated?", a: "Earnings include base pay, distance-based incentives, and 100% of customer tips." },
                    { q: "Issue with order delivery?", a: "Use the 'Emergency' button in your app or contact partner support for immediate assistance." },
                    { q: "When do I get my payouts?", a: "Weekly payouts are processed every Monday directly to your registered bank account." }
                  ].map((faq, idx) => (
                    <div key={idx} className="space-y-2">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#E23744]" /> {faq.q}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pl-6">{faq.a}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-zinc-900/30">
                    <Clock className="w-5 h-5 text-[#E23744] mt-1" />
                    <div>
                      <h4 className="text-[10px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-1">Support Hours</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Partner support is available 24/7 during active delivery hours.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-zinc-900/30">
                    <ShieldCheck className="w-5 h-5 text-[#E23744] mt-1" />
                    <div>
                      <h4 className="text-[10px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-1">Safety Policy</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">We prioritize your safety. Report any incidents through the emergency channel.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <p className="mt-12 pt-6 border-t border-gray-100 text-center text-gray-400 text-[10px] uppercase tracking-widest">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <br />
              © {new Date().getFullYear()} SwitchEats. All Rights Reserved.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
