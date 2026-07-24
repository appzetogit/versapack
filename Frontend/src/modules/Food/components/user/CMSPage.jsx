import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Lock, Loader2, Mail, Phone, MessageSquare, Clock, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

export default function CMSPage({ endpoint, title: defaultTitle, module = "USER" }) {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
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

  const handleBack = () => {
    if (window.history.length > 2) {
      goBack()
    } else {
      navigate('/food/user')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#FA0272]" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-10">
      {/* Premium Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-900">
        <div className="max-w-4xl mx-auto px-4 h-16 md:h-20 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-gray-900 dark:text-white" />
          </Button>
          <div className="flex-1">
             <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
               {pageData.title || defaultTitle}
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">SwitchEats Information</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#111] rounded-[2rem] p-6 md:p-10 shadow-sm border border-gray-50 dark:border-gray-900"
        >
          {/* Support Specific Header Cards */}
          {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center group transition-all hover:border-[#FA0272]/30">
                <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <Mail className="w-6 h-6 text-[#FA0272]" />
                </div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">Email Us</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{pageData.email || 'support@switcheats.com'}</p>
                <a href={`mailto:${pageData.email || 'support@switcheats.com'}`} className="mt-4 text-xs font-black text-[#FA0272] uppercase tracking-widest hover:underline">Send Message</a>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center group transition-all hover:border-[#FA0272]/30">
                <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <Phone className="w-6 h-6 text-[#FA0272]" />
                </div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">Call Us</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{pageData.mobile || '+91 00000 00000'}</p>
                <a href={`tel:${pageData.mobile}`} className="mt-4 text-xs font-black text-[#FA0272] uppercase tracking-widest hover:underline">Call Now</a>
              </div>
            </div>
          )}

          {pageData.content ? (
            <div
              className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-black prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
                prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-a:text-[#FA0272] dark:prose-a:text-[#EB590E]
                prose-li:text-gray-600 dark:prose-li:text-gray-400"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
            />
          ) : (
            <div className="text-center py-20">
               <Lock className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
               <p className="text-gray-400 font-medium">No additional content available at the moment.</p>
            </div>
          )}

          {/* Professional Static Content for Support */}
          {(endpoint.includes('support') || pageData.title?.toLowerCase().includes('support')) && (
            <div className="mt-12 pt-10 border-t border-gray-100 dark:border-gray-900">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 tracking-tight">Frequently Asked Questions</h2>
              <div className="grid gap-6">
                {[
                  { q: "How do I track my order?", a: "You can track your order in real-time through the 'My Orders' section in your profile." },
                  { q: "What if I receive a wrong item?", a: "Please contact our support immediately via call or email with your order ID for a quick resolution." },
                  { q: "Can I cancel my order?", a: "Orders can only be cancelled before the restaurant starts preparing your food." }
                ].map((faq, idx) => (
                  <div key={idx} className="space-y-2">
                    <h4 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#FA0272]" /> {faq.q}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pl-6">{faq.a}</p>
                  </div>
                ))}
              </div>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/30">
                  <Clock className="w-5 h-5 text-[#FA0272] mt-1" />
                  <div>
                    <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-1">Operational Hours</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Available 24/7 for emergency support. General inquiries: 9 AM - 11 PM.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/30">
                  <ShieldCheck className="w-5 h-5 text-[#FA0272] mt-1" />
                  <div>
                    <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-1">Data Privacy</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Your conversations with our support team are encrypted and secure.</p>
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
    </AnimatedPage>
  )
}
