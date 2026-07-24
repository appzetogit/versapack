import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Lock, Loader2, Mail, Phone, MessageSquare, Clock, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@food/components/ui/button"
import api from "@food/api"

export default function RestaurantCMSPage({ endpoint, title: defaultTitle, module = "RESTAURANT" }) {
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
          <Loader2 className="h-10 w-10 animate-spin text-[#FA0272]" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-10">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-full hover:bg-gray-100 transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-gray-900" />
          </Button>
          <div className="flex-1">
             <h1 className="text-xl font-bold text-gray-900 tracking-tight">
               {pageData.title || defaultTitle}
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Restaurant Partner Information</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 md:p-10 shadow-sm border border-gray-100"
        >
          {/* Support Specific Header Cards */}
          {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col items-center text-center group transition-all hover:border-[#FA0272]/30">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <Mail className="w-6 h-6 text-[#FA0272]" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Merchant Support</h3>
                <p className="text-gray-500 text-sm font-medium">{pageData.email || 'merchants@switcheats.com'}</p>
                <a href={`mailto:${pageData.email || 'merchants@switcheats.com'}`} className="mt-4 text-[10px] font-black text-[#FA0272] uppercase tracking-widest hover:underline">Email Support</a>
              </div>
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col items-center text-center group transition-all hover:border-[#FA0272]/30">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <Phone className="w-6 h-6 text-[#FA0272]" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Merchant Helpline</h3>
                <p className="text-gray-500 text-sm font-medium">{pageData.mobile || '+91 00000 00000'}</p>
                <a href={`tel:${pageData.mobile}`} className="mt-4 text-[10px] font-black text-[#FA0272] uppercase tracking-widest hover:underline">Instant Call</a>
              </div>
            </div>
          )}

          {pageData.content ? (
            <div
              className="prose prose-slate max-w-none
                prose-headings:font-bold prose-headings:text-gray-900
                prose-p:text-gray-600 prose-p:leading-relaxed
                prose-strong:text-gray-900
                prose-a:text-[#FA0272]
                prose-li:text-gray-600"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
            />
          ) : (
            <div className="text-center py-20">
               <Lock className="w-16 h-16 text-gray-100 mx-auto mb-4" />
               <p className="text-gray-400 font-medium">No additional content available at the moment.</p>
            </div>
          )}

          {/* Professional Static Content for Merchant Support */}
          {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
            <div className="mt-12 pt-10 border-t border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-8 tracking-tight">Merchant FAQs</h2>
              <div className="grid gap-6">
                {[
                  { q: "How to update menu prices?", a: "You can update prices instantly through the 'Menu Management' section in your portal." },
                  { q: "Delay in payout settlement?", a: "Payouts are settled within 48 hours of order completion. Contact support for delays exceeding 3 days." },
                  { q: "Technical issue with tablet?", a: "Restart the app and check internet connectivity. If issue persists, call our technical helpline." }
                ].map((faq, idx) => (
                  <div key={idx} className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#FA0272]" /> {faq.q}
                    </h4>
                    <p className="text-sm text-gray-500 leading-relaxed pl-6">{faq.a}</p>
                  </div>
                ))}
              </div>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50">
                  <Clock className="w-5 h-5 text-[#FA0272] mt-1" />
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-1">Business Hours</h4>
                    <p className="text-[11px] text-gray-500">Merchant support is available from 8 AM to 12 AM, 7 days a week.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50">
                  <ShieldCheck className="w-5 h-5 text-[#FA0272] mt-1" />
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-1">Secure Support</h4>
                    <p className="text-[11px] text-gray-500">Our support staff will never ask for your password or financial credentials.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <p className="text-center mt-10 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] leading-relaxed">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <br />
          © {new Date().getFullYear()} SwitchEats. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
