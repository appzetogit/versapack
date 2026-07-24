import React, { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Lenis from "lenis";
import {
  ArrowRight, ArrowLeft, Search, ShoppingCart, Play, Apple,
  MapPin, Clock, Star, Facebook, Youtube, Instagram, Linkedin,
  Zap, Award, ShieldCheck, TrendingUp, ArrowUpRight, Map,
  Users, Percent, Heart, Sparkles, X, Home, Store, Bike, Loader2
} from "lucide-react";
import { APP_CONFIG } from "../config/constants"; // Adjust path if needed
import apiClient, { restaurantAPI } from "../services/api";

// --- Animation Variants for Cinematic Reveals ---
const textReveal = {
  hidden: { y: "120%" },
  visible: (i) => ({
    y: 0,
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }
  })
};

const imageReveal = {
  hidden: { scale: 1.1, opacity: 0, clipPath: "inset(100% 0% 0% 0% round 2rem)" },
  visible: {
    scale: 1,
    opacity: 1,
    clipPath: "inset(0% 0% 0% 0% round 2rem)",
    transition: { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }
  }
};

const gridVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.15 }
  })
};

export default function LandingPage() {
  const containerRef = useRef(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [supportContact, setSupportContact] = useState({
    email: "support@switcheats.com",
    mobile: "1-800-123-4567"
  });
  const [leadForm, setLeadForm] = useState({
    ownerName: "",
    restaurantName: "",
    mobileNumber: "",
    emailId: "",
    location: "",
  });
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [activeCraving, setActiveCraving] = useState(0);

  useEffect(() => {
    async function fetchSupportInfo() {
      try {
        const response = await apiClient.get("/food/pages/support", {
          params: { module: "USER" }
        });
        const data = response?.data?.data || response?.data;
        if (data && (data.email || data.mobile)) {
          setSupportContact({
            email: data.email || "support@switcheats.com",
            mobile: data.mobile || "1-800-123-4567"
          });
        }
      } catch (err) {
        console.error("Error fetching support contact for footer:", err);
      }
    }
    fetchSupportInfo();
  }, []);

  const [mapRotate, setMapRotate] = useState({ x: 0, y: 0 });
  const handleMapMouseMove = (e) => {
    const card = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - card.left - card.width / 2;
    const y = e.clientY - card.top - card.height / 2;
    setMapRotate({ x: -y / 15, y: x / 15 });
  };
  const handleMapMouseLeave = () => {
    setMapRotate({ x: 0, y: 0 });
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    if (!leadForm.ownerName || !leadForm.restaurantName || !leadForm.mobileNumber || !leadForm.emailId || !leadForm.location) {
      alert("Please fill all the details to register.");
      return;
    }
    try {
      setSubmittingLead(true);
      await restaurantAPI.createUnregisteredRestaurant(leadForm);
      setLeadSuccess(true);
      setLeadForm({
        ownerName: "",
        restaurantName: "",
        mobileNumber: "",
        emailId: "",
        location: "",
      });
    } catch (err) {
      console.error("Error submitting lead:", err);
      alert(err.response?.data?.message || "Failed to submit. Please try again later.");
    } finally {
      setSubmittingLead(false);
    }
  };
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smooth: true,
      mouseMultiplier: 1,
    });
    lenisRef.current = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => lenis.destroy();
  }, []);

  useEffect(() => {
    if (isAboutOpen || isRestaurantOpen || isDeliveryOpen) {
      if (lenisRef.current) lenisRef.current.stop();
      document.body.style.overflow = "hidden";
    } else {
      if (lenisRef.current) lenisRef.current.start();
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAboutOpen, isRestaurantOpen, isDeliveryOpen]);

  // Handle browser back button (popstate) to close overlays instead of navigating away
  useEffect(() => {
    const handlePopState = (event) => {
      setIsAboutOpen(false);
      setIsRestaurantOpen(false);
      setIsDeliveryOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Sync React states to browser history stack
  useEffect(() => {
    const isAnyOpen = isAboutOpen || isRestaurantOpen || isDeliveryOpen;
    
    if (isAnyOpen) {
      if (!window.history.state?.modalOpen) {
        window.history.pushState({ modalOpen: true }, "");
      }
    } else {
      if (window.history.state?.modalOpen) {
        window.history.back();
      }
    }
  }, [isAboutOpen, isRestaurantOpen, isDeliveryOpen]);

  // Global Scroll Progress Hook
  const { scrollYProgress } = useScroll({ target: containerRef });

  // Hero Parallax (Mapping to the top 15% of the page scroll)
  const heroY = useTransform(scrollYProgress, [0, 0.15], ["0%", "50%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const imageParallax = useTransform(scrollYProgress, [0, 0.15], ["0%", "20%"]);

  // Phone Mockup Parallax
  const scalePhone = useTransform(scrollYProgress, [0.2, 0.4], [0.85, 1]);
  const rotatePhone = useTransform(scrollYProgress, [0.2, 0.4], [10, 0]);

  return (
    <div ref={containerRef} className="bg-[#FCFBFA] min-h-screen w-full max-w-full text-slate-900 font-sans selection:bg-[#FA0272] selection:text-white overflow-x-hidden relative">

      {/* Refined, Subtler Lighting */}
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-pink-500/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[20%] left-[-10%] w-[40vw] h-[40vw] bg-orange-400/5 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Header */}
      <header className="absolute top-0 w-full z-50 px-6 py-8 md:px-12 lg:px-20 flex items-center justify-between bg-transparent">
        <div className="text-2xl font-black text-slate-900 tracking-tighter relative z-50">
          {APP_CONFIG?.NAME || "BRAND"}
          <span className="text-[#FA0272]">.</span>
        </div>
        <nav className="flex items-center gap-1.5 bg-white/50 backdrop-blur-md border border-slate-200/30 p-1 rounded-full shadow-lg shadow-slate-900/5 relative z-50">
          <a
            href="/"
            className="group flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-full text-xs font-bold text-slate-700 hover:text-[#FA0272] hover:bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          >
            <Home className="w-4 h-4 md:w-3.5 md:h-3.5 text-slate-500 group-hover:text-[#FA0272] transition-colors" />
            <span className="hidden md:inline">Home</span>
          </a>
          <button
            onClick={() => setIsRestaurantOpen(true)}
            className="group flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-full text-xs font-bold text-slate-700 hover:text-[#FA0272] hover:bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          >
            <Store className="w-4 h-4 md:w-3.5 md:h-3.5 text-slate-500 group-hover:text-[#FA0272] transition-colors" />
            <span className="hidden md:inline">Restaurant Partner</span>
          </button>
          <button
            onClick={() => setIsDeliveryOpen(true)}
            className="group flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-full text-xs font-bold text-slate-700 hover:text-[#FA0272] hover:bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          >
            <Bike className="w-4 h-4 md:w-3.5 md:h-3.5 text-slate-500 group-hover:text-[#FA0272] transition-colors" />
            <span className="hidden md:inline">Delivery Partner</span>
          </button>
        </nav>
      </header>

      {/* 1. AWARD-WINNING HERO SECTION */}
      <section className="relative z-10 min-h-screen py-20 lg:py-0 lg:h-screen flex items-center px-6 md:px-12 lg:px-20 max-w-[1800px] mx-auto">

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center w-full h-full pt-28 lg:pt-20">

          {/* Left: Dramatic Typography */}
          <div className="col-span-1 flex flex-col justify-center z-20 h-full relative">

            <div className="overflow-hidden mb-6">
              <motion.div custom={0} initial="hidden" animate="visible" variants={textReveal} className="inline-flex items-center gap-2 text-[#FA0272] font-bold tracking-widest uppercase text-xs bg-[#FA0272]/10 px-4 py-2 rounded-full">
                <Award className="w-4 h-4" /> Michelin-Level Experience at Home
              </motion.div>
            </div>

            <h1 className="text-[10vw] lg:text-[5.8vw] font-black leading-[0.85] tracking-tighter text-slate-900 relative z-20">
              <div className="overflow-hidden pb-2">
                <motion.div custom={1} initial="hidden" animate="visible" variants={textReveal}>
                  WHAT IS
                </motion.div>
              </div>
              <div className="overflow-hidden pb-4">
                <motion.div custom={2} initial="hidden" animate="visible" variants={textReveal} className="flex items-center gap-4 lg:gap-8">
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#FA0272] to-pink-600">SWITCHEATS?</span>
                </motion.div>
              </div>
            </h1>

            <div className="overflow-hidden mt-4 lg:mt-6 max-w-xl">
              <motion.p custom={3} initial="hidden" animate="visible" variants={textReveal} className="text-base lg:text-lg text-slate-600 font-light leading-relaxed">
                SwitchEats is a next-generation food delivery platform built with a mission to create fairness and transparency in the food ecosystem. Unlike traditional platforms, we operate on a lifetime 0% commission model, ensuring that restaurant partners keep every hard-earned penny of their revenue.
              </motion.p>
            </div>

            <div className="overflow-hidden mt-6 lg:mt-8">
              <motion.div custom={4} initial="hidden" animate="visible" variants={textReveal}>
                <button
                  onClick={() => setIsAboutOpen(true)}
                  className="group flex items-center gap-3 bg-slate-900 hover:bg-[#FA0272] text-white px-8 py-4 rounded-full font-bold text-sm transition-all duration-500 hover:shadow-xl hover:shadow-[#FA0272]/20 cursor-pointer"
                >
                  Learn More About Our Mission
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            </div>
          </div>

          {/* Right: The Cinematic Centerpiece */}
          <div className="hidden lg:flex col-span-1 h-full items-center justify-end">

            <motion.div
              initial="hidden"
              animate="visible"
              variants={imageReveal}
              style={{ y: imageParallax }}
              className="relative w-full h-[75vh] max-h-[750px] rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Overlay Gradient to blend with text on smaller screens */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent z-10" />

              <img
                src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=1200&auto=format&fit=crop"
                alt="Gourmet Plating"
                className="w-full h-full object-cover"
              />

              {/* Minimal Floating Element */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.5, duration: 0.8 }}
                className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-xl flex items-center gap-4 z-20 border border-white/50"
              >
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div className="pr-4">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Average Delivery</p>
                  <p className="text-xl font-black text-slate-900 leading-none mt-1">15 Mins</p>
                </div>
              </motion.div>

            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* 2. OUR STORY / ASYMMETRICAL LAYOUT */}
      <section className="relative z-10 py-32 px-6 md:px-16 lg:px-24 max-w-[1800px] mx-auto">
        <div className="grid lg:grid-cols-2 gap-20 items-center">

          <div className="space-y-8">
            <span className="inline-block text-xs font-black tracking-[0.3em] text-[#FA0272] uppercase bg-pink-50 border border-pink-100 rounded-full px-3 py-1">
              About SwitchEats
            </span>
            <h3 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-slate-900">
              Empowering partners, <br /><span className="italic text-slate-500 font-light">restoring trust.</span>
            </h3>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed font-light max-w-lg">
              Unlike traditional delivery apps that squeeze restaurant margins, SwitchEats works on a lifetime 0% commission model. We believe in creating a balanced, fair, and growth-oriented food ecosystem.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setIsAboutOpen(true)}
                className="group inline-flex items-center gap-2.5 text-slate-900 hover:text-[#FA0272] font-bold text-sm tracking-wide uppercase transition-colors"
              >
                Read Our Story <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            <div className="pt-8 grid grid-cols-2 gap-8 border-t border-slate-200">
              <div>
                <p className="text-4xl font-black text-slate-950">0%</p>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-2">Lifetime Commission</p>
              </div>
              <div>
                <p className="text-4xl font-black text-slate-950">100%</p>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-2">Revenue Retained</p>
              </div>
            </div>
          </div>

          <div className="relative h-[400px] lg:h-[600px] rounded-[2.5rem] overflow-hidden group shadow-2xl border-4 border-white">
            <div className="absolute inset-0 bg-[#FA0272] mix-blend-overlay opacity-10 z-10 group-hover:opacity-0 transition-opacity duration-700" />
            <img
              src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?q=80&w=1000&auto=format&fit=crop"
              alt="Chef working"
              className="w-full h-full object-cover transform scale-105 group-hover:scale-100 transition-transform duration-1000 ease-out"
            />
          </div>
        </div>
      </section>

      {/* 3. MOBILE EXPERIENCE (Floating Phone Parallax) */}
      <section className="relative z-10 py-32 bg-slate-50/60 backdrop-blur-3xl border-y border-slate-100">
        <div className="max-w-[1800px] mx-auto px-6 md:px-16 lg:px-24 flex flex-col lg:flex-row items-center gap-20">

          {/* Phone Mockup Column */}
          <div className="flex-1 lg:pl-20 order-2 lg:order-1">
            <motion.div style={{ scale: scalePhone, rotateZ: rotatePhone }} className="relative w-[290px] sm:w-[320px] h-[580px] sm:h-[640px] mx-auto perspective-1000">

              {/* 3D Phone CSS Mockup */}
              <div className="absolute inset-0 rounded-[3rem] bg-slate-900 p-2 shadow-[0_40px_80px_rgba(15,23,42,0.12)] border border-slate-800 transform-style-3d shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-6 bg-black rounded-b-2xl z-20" />
                <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative border border-slate-100">
                  <img
                    src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop"
                    className="w-full h-[55%] object-cover"
                    alt="App preview"
                  />
                  <div className="absolute bottom-0 w-full h-[50%] bg-gradient-to-t from-white via-white to-transparent p-6 flex flex-col justify-end">
                    <div className="w-12 h-1 bg-slate-200 rounded-full mb-6 mx-auto" />
                    <h4 className="text-2xl font-black text-slate-900 mb-1">Sushi Masterclass</h4>
                    <p className="text-slate-500 text-xs font-semibold mb-4">Japanese • 4.9 <Star className="inline w-3 h-3 text-[#FA0272] fill-[#FA0272] mb-0.5" /></p>
                    <button className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold hover:bg-[#FA0272] transition-colors duration-300 text-sm shadow-md">
                      Track Delivery
                    </button>
                  </div>
                </div>
              </div>

              {/* Floating App Card */}
              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-8 sm:-right-12 top-32 bg-white border border-slate-200/60 p-4 rounded-2xl shadow-xl flex items-center gap-3.5 z-20"
              >
                <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-[#FA0272]" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Arriving In</p>
                  <p className="text-base font-black text-slate-900">14 mins</p>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* App Info Column */}
          <div className="flex-1 space-y-8 order-1 lg:order-2">
            <span className="inline-block text-xs font-black tracking-[0.3em] text-[#FA0272] uppercase bg-pink-50 border border-pink-100 rounded-full px-3 py-1">
              Mobile Experience
            </span>
            <h3 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-slate-900">
              Flawless <br />from tap to table.
            </h3>
            <p className="text-lg md:text-xl text-slate-600 font-light leading-relaxed max-w-lg">
              Live tracking that actually updates. Beautifully designed interface. Zero friction. Download the app to experience food delivery designed for the modern era.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <a
                href="https://apps.apple.com/in/app/switcheats/id6766444150"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-slate-900 text-white hover:bg-[#FA0272] px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md shadow-slate-900/10 cursor-pointer"
              >
                <Apple className="w-5 h-5" /> App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.switcheats.user1"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-sm cursor-pointer"
              >
                <Play className="w-5 h-5" /> Google Play
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 4. LATE NIGHT CRAVINGS - Cinematic 3D Interactive Midnight Console Stage */}
      <section className="relative z-10 py-36 bg-[#030303] text-slate-100 overflow-hidden">
        
        {/* Dynamic ambient backdrop glow matching active item */}
        <div 
          className="absolute inset-0 transition-all duration-1000 ease-out pointer-events-none opacity-40 blur-[150px]"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${
              activeCraving === 0 ? '#FA0272' : activeCraving === 1 ? '#EB590E' : '#EAB308'
            } 0%, transparent 60%)`
          }}
        />

        {/* Abstract Grid Lines for Spatial Depth */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px] pointer-events-none opacity-20" />

        <div className="max-w-[1800px] mx-auto px-6 md:px-16 lg:px-24 relative z-10">
          
          {/* Section Header */}
          <div className="text-center mb-24">
            <span className="inline-flex items-center gap-2 text-[10px] font-black tracking-[0.35em] text-[#FA0272] uppercase bg-[#FA0272]/10 border border-[#FA0272]/30 rounded-full px-4 py-2 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FA0272] animate-ping" />
              Midnight Gastronomy
            </span>
            <h3 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white mb-6">
              Late Night <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-slate-400 to-[#FA0272] italic font-light">Cravings.</span>
            </h3>
            <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base font-light leading-relaxed">
              Curated epicurean experiences crafted for the midnight hours. Fully active between 11:00 PM and 4:00 AM.
            </p>
          </div>

          {/* Interactive Console Console Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            
            {/* Left Console: Tab selectors (Columns 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6 order-2 lg:order-1">
              {[
                { 
                  tag: "🔥 BESTSELLER", 
                  title: "Midnight Wagyu Burger", 
                  num: "01",
                  time: "15-20 min", 
                  desc: "Double-patty dry-aged Wagyu beef, aged cheddar melt, caramelized onion jam, and truffle aioli on toasted brioche.",
                  color: "#FA0272",
                  ingredients: ["🧀 Cheddar", "🧅 Onion Jam", "🍞 Brioche", "🍄 Truffle"]
                },
                { 
                  tag: "⚡ CHEF'S SPECIAL", 
                  title: "Spicy Tonkotsu Ramen", 
                  num: "02",
                  time: "20-30 min", 
                  desc: "Rich 12-hour pork bone broth, hand-pulled noodles, spicy tare, pork chashu, and soy-cured soft egg.",
                  color: "#EB590E",
                  ingredients: ["🥚 Cured Egg", "🥩 Chashu", "🧅 Scallions", "🌶️ Chili Tare"]
                },
                { 
                  tag: "👑 LATE NIGHT EXCLUSIVE", 
                  title: "Signature Loaded Fries", 
                  num: "03",
                  time: "10-15 min", 
                  desc: "Triple-cooked crispy potatoes smothered in cheddar melt, wood-smoked bacon, and white truffle oil.",
                  color: "#EAB308",
                  ingredients: ["🍟 Crispy Fries", "🥓 Smoked Bacon", "🌿 Chives", "🧀 Cheddar"]
                }
              ].map((item, index) => {
                const isActive = activeCraving === index;
                return (
                  <div
                    key={index}
                    onClick={() => setActiveCraving(index)}
                    className={`group relative rounded-[2rem] p-8 cursor-pointer border transition-all duration-500 ease-out select-none ${
                      isActive 
                        ? "bg-white/[0.03] border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]" 
                        : "bg-transparent border-transparent hover:bg-white/[0.01] hover:border-white/5"
                    }`}
                  >
                    {/* Left Active border bar indicator */}
                    <div 
                      className={`absolute left-0 top-8 bottom-8 w-1 rounded-r-full transition-all duration-500 ${
                        isActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0 group-hover:scale-y-50 group-hover:opacity-50"
                      }`}
                      style={{ backgroundColor: item.color }}
                    />

                    <div className="flex gap-6 items-start">
                      <span 
                        className={`text-2xl font-black transition-colors duration-500 ${isActive ? "text-white" : "text-slate-600 group-hover:text-slate-400"}`}
                        style={{ color: isActive ? item.color : undefined }}
                      >
                        {item.num}
                      </span>
                      
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span 
                            className="text-[9px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10"
                            style={{ color: isActive ? item.color : '#94A3B8' }}
                          >
                            {item.tag}
                          </span>
                          <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {item.time}
                          </span>
                        </div>

                        <h4 className="text-xl md:text-2xl font-black text-white group-hover:text-slate-200 transition-colors duration-300">
                          {item.title}
                        </h4>

                        {/* Slide open description & action */}
                        <div 
                          className={`transition-all duration-500 ease-in-out overflow-hidden ${
                            isActive ? "max-h-[300px] mt-4 opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <p className="text-slate-400 text-xs md:text-sm font-light leading-relaxed mb-5">
                            {item.desc}
                          </p>

                          <div className="flex flex-wrap gap-2 mb-2">
                            {item.ingredients.map((ing, k) => (
                              <span key={k} className="text-[10px] font-semibold text-slate-300 bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg">
                                {ing}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Console: The floating cinematic 3D Stage (Columns 7) */}
            <div className="lg:col-span-7 flex justify-center items-center order-1 lg:order-2 h-[500px] md:h-[600px] relative">
              
              {/* Dynamic Pedestal Under-glow Shadow */}
              <div 
                className="absolute bottom-12 w-[350px] md:w-[480px] h-[35px] rounded-full blur-[40px] opacity-40 transition-all duration-1000 ease-out"
                style={{
                  background: activeCraving === 0 ? '#FA0272' : activeCraving === 1 ? '#EB590E' : '#EAB308'
                }}
              />

              {/* Floating Culinary Stage Container */}
              <motion.div
                className="relative cursor-pointer select-none group/plate"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1 }}
              >
                {/* Orbital floating decorative elements */}
                <div className="absolute inset-0 pointer-events-none z-20">
                  <span className="absolute -top-6 -right-6 animate-bounce text-2xl" style={{ animationDuration: '4s' }}>🌶️</span>
                  <span className="absolute -bottom-8 -left-8 animate-bounce text-2xl" style={{ animationDuration: '6s' }}>🌿</span>
                  <span className="absolute top-1/2 -left-12 animate-bounce text-2xl" style={{ animationDuration: '5s' }}>🧄</span>
                </div>

                {/* Animated plate layout transitions */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeCraving}
                    initial={{ rotate: -45, scale: 0.8, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: 45, scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-[340px] h-[340px] md:w-[480px] md:h-[480px] rounded-full p-2 bg-gradient-to-tr from-white/10 to-transparent border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
                  >
                    {/* Inner gloss layer */}
                    <div className="absolute inset-0 bg-black/10 group-hover/plate:bg-black/0 transition-all duration-500" />
                    
                    {/* Plate Food Image */}
                    <img 
                      src={
                        activeCraving === 0 
                          ? "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1000&auto=format&fit=crop" 
                          : activeCraving === 1 
                            ? "https://images.unsplash.com/photo-1557872943-16a5ac26437e?q=80&w=1000&auto=format&fit=crop" 
                            : "https://images.unsplash.com/photo-1534080564583-6be75777b70a?q=80&w=1000&auto=format&fit=crop"
                      }
                      alt="Late Night Cravings Showcase Plate" 
                      className="w-full h-full object-cover rounded-full transform scale-100 group-hover/plate:scale-105 transition-all duration-700 ease-out"
                    />

                    {/* Stage circular glass highlight border */}
                    <div className="absolute inset-0 rounded-full border-[10px] border-white/5 pointer-events-none" />
                  </motion.div>
                </AnimatePresence>

                {/* Clock Overlay Badge */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md border border-white/10 px-5 py-2.5 rounded-full flex items-center gap-2.5 shadow-2xl z-30">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black tracking-widest text-white uppercase whitespace-nowrap">Service Active</span>
                </div>
              </motion.div>
            </div>
            
          </div>
        </div>
      </section>
      {/* 4.1 whats waiting for you section */}
      <section className="relative z-10 py-20 md:py-24 px-6 md:px-12 lg:px-20 max-w-[1800px] mx-auto bg-[#FCFBFA]">

        {/* Section Header */}
        <div className="mb-12 md:mb-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <span className="inline-block text-xs font-black tracking-[0.3em] text-[#FA0272] uppercase bg-[#FA0272]/10 border border-[#FA0272]/20 rounded-full px-4 py-1.5 mb-6">
              The Experience
            </span>
            <h2 className="text-4xl lg:text-6xl font-black leading-[0.95] tracking-tighter text-slate-900">
              What's Waiting <br />
              <span className="italic font-light text-slate-500">For You.</span>
            </h2>
          </div>
          <p className="text-base md:text-lg text-slate-600 font-light max-w-sm leading-relaxed pb-1">
            Beyond just food delivery. We are engineering a new standard for dining at home.
          </p>
        </div>

        {/* Asymmetrical Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">

          {/* Left Column - Card 1 */}
          <div className="md:col-span-8 h-full">
            {/* Card 1: Large Featured */}
            <motion.div
              custom={0} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
              variants={gridVariants}
              className="group relative w-full h-full min-h-[350px] md:min-h-0 rounded-[2rem] overflow-hidden bg-slate-900 shadow-xl"
            >
              <img
                src="https://images.unsplash.com/photo-1600891964092-4316c288032e?q=80&w=1200&auto=format&fit=crop"
                alt="Chef preparing premium steak"
                className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-90 transition-all duration-1000 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              <div className="absolute top-6 left-6 w-11 h-11 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
                <Award className="w-5 h-5 text-white" />
              </div>

              <div className="absolute bottom-0 w-full p-6 md:p-10">
                <h3 className="text-2xl md:text-4xl font-black text-white mb-3 tracking-tight">The Culinary Elite</h3>
                <p className="text-slate-300 text-sm md:text-base font-light max-w-md mb-5 leading-relaxed">
                  Exclusive access to menus from Michelin-starred kitchens and highly sought-after private chefs, unavailable anywhere else.
                </p>
                <button className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider group/btn">
                  Meet The Chefs <ArrowUpRight className="w-4 h-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Card 2 & Card 3 */}
          <div className="md:col-span-4 flex flex-col gap-6 h-full">
            {/* Card 2: Top Right */}
            <motion.div
              custom={1} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
              variants={gridVariants}
              className="group relative flex-1 min-h-[250px] md:min-h-0 rounded-[2rem] overflow-hidden bg-white border border-slate-200 shadow-xl shadow-slate-200/50 p-6 md:p-8 flex flex-col justify-between hover:shadow-2xl hover:-translate-y-1 transition-all duration-500"
            >
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center border border-pink-100 group-hover:bg-[#FA0272] transition-colors duration-500">
                <Map className="w-5 h-5 text-[#FA0272] group-hover:text-white transition-colors duration-500" />
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-2 tracking-tight">Surgical Precision</h3>
                <p className="text-slate-600 font-light text-xs md:text-sm leading-relaxed">
                  Proprietary routing algorithms ensure your meal arrives at the exact optimum temperature. Watch it live, down to the exact intersection.
                </p>
              </div>
            </motion.div>

            {/* Card 3: Bottom Right (Split into two on desktop) */}
            <motion.div
              custom={2} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
              variants={gridVariants}
              className="flex-1 min-h-[250px] md:min-h-0 grid grid-cols-2 gap-6"
            >
              {/* Sub-card A */}
              <div className="col-span-1 rounded-[2rem] overflow-hidden relative group shadow-lg">
                <img
                  src="https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?q=80&w=800&auto=format&fit=crop"
                  alt="Premium Packaging"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-500" />
                <div className="absolute bottom-5 left-5 right-5">
                  <h4 className="text-white font-bold text-base md:text-lg leading-tight">Bespoke<br />Packaging</h4>
                </div>
              </div>

              {/* Sub-card B */}
              <div className="col-span-1 rounded-[2rem] bg-slate-900 p-5 md:p-6 flex flex-col justify-between border border-slate-800 group hover:bg-[#FA0272] transition-colors duration-500 shadow-lg">
                <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-bold text-base md:text-lg leading-tight mb-1">Zero<br />Compromise</h4>
                  <p className="text-slate-400 text-[10px] md:text-xs group-hover:text-white/80 transition-colors">Sealed, hygienic, and pristine.</p>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </section>

      {/* 4.5 GEOGRAPHY / Telengana Highlight */}
      <section className="relative z-10 py-24 px-6 md:px-16 lg:px-24 max-w-[1800px] mx-auto overflow-hidden">
        {/* Glow ambient background lights */}
        <div className="absolute top-[20%] right-[-10%] w-[30vw] h-[30vw] bg-pink-500/5 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-[10%] left-[-10%] w-[25vw] h-[25vw] bg-orange-400/5 rounded-full blur-[100px] pointer-events-none z-0" />

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-10">

          {/* Left Column: Text Content */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 text-xs font-black tracking-[0.25em] text-[#FA0272] uppercase bg-[#FA0272]/10 border border-[#FA0272]/20 rounded-full px-4 py-2">
                <MapPin className="w-3.5 h-3.5" /> Our Geography
              </span>
              <h3 className="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight text-slate-900">
                Where We Are <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-500 italic font-light">Operating.</span>
              </h3>
              <p className="text-lg text-slate-600 font-light leading-relaxed">
                Starting our journey from the progressive landscape of <strong>Telangana</strong>, SwitchEats is engineered to scale across India, specifically focusing on empowering Tier-2 and Tier-3 cities.
              </p>
            </div>

            {/* Features list */}
            <div className="space-y-4">
              <div className="group bg-white/70 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl hover:shadow-xl hover:shadow-pink-500/5 transition-all duration-300 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#FA0272]/10 flex items-center justify-center text-[#FA0272] shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Telangana Launchpad (Active)</h4>
                  <p className="text-sm text-slate-500 font-light">
                    Our central headquarters and active delivery operations. Reclaiming restaurant revenues with 0% lifetime commission.
                  </p>
                </div>
              </div>

              <div className="group bg-white/70 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl hover:shadow-xl hover:shadow-pink-500/5 transition-all duration-300 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Empowering Tier 2 & 3 Cities</h4>
                  <p className="text-sm text-slate-500 font-light">
                    Taking modern, commission-free food commerce to growing towns and communities that traditional giants ignore or overcharge.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Glowing India Map Visual */}
          <div className="lg:col-span-7 flex justify-center w-full">
            <motion.div 
              className="w-full max-w-[550px] bg-slate-950 rounded-[3rem] p-6 md:p-10 border border-slate-800 shadow-2xl relative overflow-hidden h-[540px] flex flex-col justify-between cursor-pointer"
              onMouseMove={handleMapMouseMove}
              onMouseLeave={handleMapMouseLeave}
              animate={{ rotateX: mapRotate.x, rotateY: mapRotate.y }}
              transition={{ type: "spring", stiffness: 150, damping: 15 }}
              style={{ transformStyle: "preserve-3d", perspective: 1000 }}
            >

              {/* Grid Overlay */}
              <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none z-0" />

              {/* Scanner Line Overlay */}
              <motion.div
                className="absolute left-0 right-0 h-[100px] bg-gradient-to-b from-[#FA0272]/0 via-[#FA0272]/5 to-[#FA0272]/0 pointer-events-none z-0 border-y border-[#FA0272]/5"
                animate={{ top: ["-100px", "540px"] }}
                transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
              />

              {/* Map Widget Header */}
              <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Live Network Operations</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Region: Telangana
                </div>
              </div>

              {/* The Map Graph Wrapper with Masked Image and Premium Overlays */}
              <div className="relative z-10 flex-1 flex items-center justify-center py-4 overflow-hidden select-none pointer-events-none">
                <img 
                  src="/india-map-operations.jpg" 
                  alt="Switcheats Operational Map" 
                  className="w-full h-full object-contain filter brightness-110 contrast-105 saturate-110 transform scale-[1.18]"
                  style={{
                    maskImage: 'radial-gradient(circle at center, black 65%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(circle at center, black 65%, transparent 100%)'
                  }}
                />

                {/* Horizontal glowing pointer connector line */}
                <div 
                  className="hidden lg:block absolute top-[61.5%] left-[46.8%] w-[10.2%] h-[1.5px] bg-gradient-to-r from-[#FA0272] to-[#FA0272]/40 z-20 pointer-events-none"
                  style={{ transform: "translateY(-50%)" }}
                />

                {/* Animated Pulsing Pin on top of Telangana in the image */}
                <div className="absolute top-[61.5%] left-[46.8%] -translate-x-1/2 -translate-y-1/2 z-20">
                  {/* Super tight ping beacon */}
                  <span className="absolute inline-flex h-5 w-5 -top-2.5 -left-2.5 rounded-full bg-[#FA0272]/85 animate-ping" />
                  
                  {/* Glowing Core center - sharp, bright, and tiny */}
                  <span className="relative block rounded-full h-2.5 w-2.5 bg-white shadow-[0_0_8px_#fff,0_0_12px_#FA0272]" />
                </div>

                {/* Floating Active Info Tag over the beacon, centered above it on mobile, shifted right on desktop */}
                <div className="absolute top-[61.5%] left-[48%] lg:left-[57%] -translate-x-1/2 lg:translate-x-0 -translate-y-[280%] lg:-translate-y-1/2 bg-slate-900/95 border border-[#FA0272]/50 text-[9px] font-black text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xl shadow-pink-500/20 whitespace-nowrap z-30">
                  <span className="w-2 h-2 rounded-full bg-[#FA0272] animate-ping" />
                  TELANGANA (ACTIVE HUB)
                </div>
              </div>

              {/* Map Footer Metadata */}
              <div className="relative z-10 border-t border-slate-800/80 pt-4 flex items-center justify-between text-[9px] text-slate-500 uppercase tracking-widest font-black shrink-0">
                <span>Hub Status: active</span>
                <span>Latency: 18ms</span>
                <span>Network Integrity: 100%</span>
              </div>
            </motion.div>
          </div>

        </div>
      </section>

      {/* 5. FASTEST DELIVERY / GLOWING ROUTE */}
      <section className="relative z-10 py-32 px-6 md:px-16 lg:px-24 max-w-[1800px] mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-20">

          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <span className="inline-block text-xs font-black tracking-[0.3em] text-[#FA0272] uppercase bg-pink-50 border border-pink-100 rounded-full px-3 py-1">
                Precision Logistics
              </span>
              <h3 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-slate-900">
                Fastest <br /><span className="italic text-slate-500 font-light">Delivery Route.</span>
              </h3>
              <p className="text-base md:text-lg text-slate-600 font-light leading-relaxed max-w-lg">
                Our advanced routing algorithm calculates the exact fastest path to your door, avoiding traffic and delays. Watch your order arrive in real-time.
              </p>
            </div>

            {/* Premium Feature Stats / Cards */}
            <div className="grid grid-cols-1 gap-4 pt-4">
              {[
                { 
                  icon: Zap, 
                  title: "Predictive AI Dispatch", 
                  desc: "Riders are auto-positioned based on historical demand models before you even checkout." 
                },
                { 
                  icon: ShieldCheck, 
                  title: "Active Thermal Control", 
                  desc: "Meals are packed in temperature-isolated chambers maintaining exact kitchen heat." 
                },
                { 
                  icon: TrendingUp, 
                  title: "Average Speed: 22 Mins", 
                  desc: "A highly optimized city-wide rider network designed for unmatched delivery velocity." 
                }
              ].map((feat, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.6 }}
                  className="flex gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-200/60 hover:bg-white hover:border-[#FA0272]/20 hover:shadow-lg transition-all duration-300 group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FA0272] group-hover:bg-[#FA0272] group-hover:text-white transition-all duration-300 shrink-0">
                    <feat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{feat.title}</h4>
                    <p className="text-slate-500 text-xs font-light mt-0.5 leading-relaxed">{feat.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Interactive live radar route container with glass HUDs */}
          <div className="flex-1 w-full h-[380px] sm:h-[500px] relative rounded-[2.5rem] border border-slate-200/80 bg-slate-50/50 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-xl">

            {/* Radar Sweep Animation Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(250,2,114,0.025)_0%,transparent_60%)] z-0" />
            <div className="absolute top-[20%] left-[20%] w-[350px] h-[350px] bg-pink-100/30 rounded-full blur-[80px] opacity-40 pointer-events-none" />

            {/* Map Grid Dots Background */}
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0F172A 1px, transparent 0)', backgroundSize: '32px 32px' }} />

            {/* Glass HUD 1: Active Signal */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-white/90 backdrop-blur-md border border-slate-200/50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl flex items-center gap-2 shadow-md z-20">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[9px] sm:text-[10px] font-black tracking-widest text-slate-800 uppercase">Live Dispatch Signal</span>
            </div>

            {/* Glass HUD 2: Rider Stats */}
            <div className="hidden sm:flex absolute sm:bottom-6 sm:left-6 bg-white/90 backdrop-blur-md border border-slate-200/50 sm:p-4 rounded-2xl flex-col gap-1 shadow-md z-20 sm:text-xs sm:w-[220px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Zap className="w-3.5 h-3.5 text-[#FA0272]" /> <span>Rider Telemetry</span>
              </div>
              <div className="text-slate-500 text-[10px] font-medium font-mono leading-relaxed pt-1.5 border-t border-slate-100 mt-1">
                Speed: 42 km/h <br />
                Temp: 74°C (Hot Chamber) <br />
                Route: Optimal Engaged
              </div>
            </div>

            {/* Floating Location Badges */}
            <div className="hidden sm:block absolute top-[18%] left-[10%] bg-pink-50/95 backdrop-blur-sm border border-pink-100 px-3 py-1 rounded-xl text-[9px] font-black tracking-widest text-[#FA0272] shadow-sm z-20 animate-pulse">
              KITCHEN PICKUP
            </div>
            <div className="hidden sm:block absolute bottom-[20%] right-[10%] bg-[#0F172A]/90 backdrop-blur-sm px-3 py-1 rounded-xl text-[9px] font-black tracking-widest text-white shadow-sm z-20 animate-pulse">
              YOUR DOORSTEP
            </div>

            {/* Animated SVG Route */}
            <svg viewBox="0 0 400 300" className="w-full h-full max-w-[400px] relative z-10 p-6">
              <path d="M 50 250 Q 150 250, 200 150 T 350 50" fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="4" strokeLinecap="round" />
              <motion.path
                d="M 50 250 Q 150 250, 200 150 T 350 50"
                fill="none"
                stroke="#FA0272"
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: false, margin: "-100px" }}
                transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatType: "loop", repeatDelay: 1 }}
                style={{ filter: "drop-shadow(0px 0px 8px rgba(250,2,114,0.5))" }}
              />
              <circle cx="50" cy="250" r="8" fill="#FA0272" className="shadow-[0_0_10px_#FA0272]" />
              <circle cx="350" cy="50" r="8" fill="#0F172A" />
            </svg>
          </div>
        </div>
      </section>

      {/* 6. FOOTER */}
      <footer className="relative z-10 bg-slate-50 pt-32 pb-10 px-6 md:px-16 lg:px-24 border-t border-slate-200/50 overflow-hidden text-slate-600">

        <div className="max-w-[1800px] mx-auto">
          <div className="grid lg:grid-cols-5 gap-16 mb-24 relative z-10">
            <div className="lg:col-span-2">
              <h2 className="text-5xl font-black tracking-tighter text-slate-950 mb-6">
                {APP_CONFIG?.NAME || "BRAND"}<span className="text-[#FA0272]">.</span>
              </h2>
              <p className="text-slate-500 text-lg font-light leading-relaxed max-w-sm mb-8">
                Elevating the dining experience. Premium food delivery for those who expect more.
              </p>
              <div className="flex gap-4">
                {[
                  { Icon: Facebook, url: "https://www.facebook.com/share/1J8C8U4wnK/?mibextid=wwXIfr" },
                  { Icon: Youtube, url: "https://youtube.com/@switcheats?si=EzceIs61zBwz3SGO" },
                  { Icon: Instagram, url: "https://www.instagram.com/switcheats?igsh=MTA3eXJnMTRlMTF5Zw%3D%3D&utm_source=qr" },
                  { Icon: Linkedin, url: "https://www.linkedin.com/company/switcheats/" }
                ].map(({ Icon, url }, i) => (
                  <a 
                    key={i} 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-11 h-11 rounded-full border border-slate-200 flex items-center justify-center hover:bg-[#FA0272] hover:border-[#FA0272] hover:text-white cursor-pointer transition-all duration-300 text-slate-700 bg-white shadow-sm"
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </a>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-5 text-sm font-medium">
              <h4 className="text-slate-900 font-bold tracking-widest text-xs uppercase mb-1">Legal</h4>
              <a 
                href="https://switcheats.com/food/user/profile/privacy" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-[#FA0272] transition-colors"
              >
                Privacy Policy
              </a>
              <a 
                href="https://switcheats.com/food/user/profile/terms" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-[#FA0272] transition-colors"
              >
                Terms of Service
              </a>
            </div>

            <div className="flex flex-col gap-5 text-sm font-medium">
              <h4 className="text-slate-900 font-bold tracking-widest text-xs uppercase mb-1">Company</h4>
              <a 
                href="https://switcheats.com/food/user/profile/about" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-[#FA0272] transition-colors"
              >
                About Us
              </a>
              <a 
                href="https://switcheats.com/food/user/profile/help-content" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-[#FA0272] transition-colors"
              >
                Support
              </a>
            </div>

            <div className="flex flex-col gap-5 text-sm font-medium">
              <h4 className="text-slate-900 font-bold tracking-widest text-xs uppercase mb-1">Contact</h4>
              <a href={`mailto:${supportContact.email}`} className="hover:text-[#FA0272] transition-colors">{supportContact.email}</a>
              <a href={`tel:${supportContact.mobile}`} className="hover:text-[#FA0272] transition-colors">{supportContact.mobile}</a>
              <p className="text-slate-400 text-xs mt-3 leading-relaxed">Available 24/7 for premium members.</p>
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 relative z-10 text-xs font-semibold">
            <p className="text-slate-400">© 2026 {APP_CONFIG?.NAME || 'Brand'} Technologies Inc. All rights reserved.</p>
            <div className="flex gap-6">
              <p className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">System Status: <span className="text-emerald-500">100% Operational</span></p>
            </div>
          </div>
        </div>
      </footer>

      {/* --- Full-Screen Interactive About Page --- */}
      <AnimatePresence>
        {isAboutOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#FCFBFA] overflow-y-auto flex flex-col selection:bg-[#FA0272] selection:text-white"
          >
            {/* Ambient Background Lights */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-pink-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-orange-400/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Header */}
            <header className="sticky top-0 w-full z-50 px-6 py-6 md:px-12 lg:px-20 flex items-center justify-between bg-[#FCFBFA]/80 backdrop-blur-md border-b border-slate-200/40 shrink-0">
              <div className="text-2xl font-black text-slate-900 tracking-tighter">
                {APP_CONFIG?.NAME || "SwitchEats"}
                <span className="text-[#FA0272]">.</span>
              </div>
              <button
                onClick={() => setIsAboutOpen(false)}
                className="group flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full text-xs font-bold hover:bg-[#FA0272] transition-all duration-300 shadow-md hover:shadow-lg shadow-slate-900/10 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Home
              </button>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title */}
              <div className="max-w-3xl space-y-6">
                <span className="inline-flex items-center gap-2 text-[#FA0272] font-bold tracking-widest uppercase text-xs bg-[#FA0272]/10 px-4 py-2 rounded-full">
                  <Sparkles className="w-4 h-4" /> The Movement
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                  Reclaiming Fairness <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-500 italic font-light">in the Food Ecosystem.</span>
                </h1>
                <p className="text-xl text-slate-600 font-light leading-relaxed">
                  SwitchEats is built with a mission to create a sustainable, transparent, and balanced environment for both food merchants and consumers across India.
                </p>
              </div>

              {/* Central Blockquote Quote Banner */}
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0">
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-[#FA0272]/20 rounded-full blur-[90px] pointer-events-none" />
                <div className="relative z-10 space-y-6">
                  <p className="text-2xl md:text-3xl lg:text-4xl font-light leading-relaxed italic text-slate-100 max-w-4xl">
                    "SwitchEats isn’t just a food delivery app—it’s a movement towards fair business, trust, and transparency."
                  </p>
                  <div className="w-16 h-1 bg-[#FA0272] rounded-full" />
                  <p className="text-xs uppercase tracking-widest font-bold text-slate-400">Our Core Philosophy</p>
                </div>
              </div>

              {/* Dynamic Value Story Grid */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Story Card 1: 0% Commission */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#FA0272]/10 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Percent className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Lifetime 0% Commission</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      We operate on a lifetime 0% commission model. This ensures that our restaurant partners keep every hard-earned penny of their revenue, giving them the financial breathing room to grow, sustain jobs, and thrive in a digital economy.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Hidden Partner Fees</span>
                  </div>
                </div>

                {/* Story Card 2: Transparent Pricing */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 mb-6 group-hover:scale-110 transition-transform">
                      <Heart className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Trust & Transparent Pricing</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      By offering transparent pricing, SwitchEats ensures customers pay genuine prices without hidden markups. We are building long-term relationships of trust with both restaurants and consumers.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Honest Pricing Guarantee</span>
                  </div>
                </div>

                {/* Story Card 3: Geographical Expansion */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                      <MapPin className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Telangana to Tier 2 & 3 Cities</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      SwitchEats is starting its journey from Telangana, with a strategic focus on expanding across Tier 2 and Tier 3 cities in India. We aim to empower local businesses in these growing regions and integrate them into the digital market.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <Map className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empowering Local Communities</span>
                  </div>
                </div>

                {/* Story Card 4: Two Young Founders */}
                <div className="group bg-white border border-slate-200/60 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Founded by Visionaries</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      SwitchEats was founded by two passionate 23-year-old entrepreneurs driven by a vision to revolutionize the food delivery industry and create a more balanced, fair, and growth-oriented platform for all stakeholders.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Innovation Led By Youth</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action */}
              <div className="text-center py-12 md:py-20 border-t border-slate-200/60 flex flex-col items-center gap-6 shrink-0">
                <h3 className="text-3xl md:text-4xl font-black text-slate-900">Be Part of the Movement</h3>
                <p className="text-slate-500 max-w-lg font-light">
                  Support your local neighborhood restaurants. Join SwitchEats today as a customer or partner and help us create a fair ecosystem.
                </p>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => setIsAboutOpen(false)}
                    className="bg-slate-900 text-white hover:bg-[#FA0272] px-8 py-4 rounded-full font-bold text-sm transition-all duration-300 shadow-md shadow-slate-900/10 cursor-pointer"
                  >
                    Return to Homepage
                  </button>
                </div>
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-50 border-t border-slate-200/50 py-8 text-center text-xs text-slate-400 font-medium shrink-0">
              <p>© 2026 {APP_CONFIG?.NAME || "SwitchEats"} Technologies Inc. All rights reserved.</p>
            </footer>
          </motion.div>
        )}

        {isRestaurantOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#FAF7F2] overflow-y-auto flex flex-col selection:bg-[#FA0272] selection:text-white"
          >
            {/* Ambient Background Lights - Signature Pink and Warm Amber */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#FA0272]/5 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-orange-400/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Header */}
            <header className="sticky top-0 w-full z-50 px-4 py-4 md:px-12 lg:px-20 flex items-center justify-between bg-[#FAF7F2]/90 backdrop-blur-md border-b border-slate-200/40 shrink-0">
              <div className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                {APP_CONFIG?.NAME || "SwitchEats"}
                <span className="text-[#FA0272]">.</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => document.getElementById("partner-lead-form")?.scrollIntoView({ behavior: "smooth" })}
                  className="group flex items-center gap-1.5 sm:gap-2 bg-[#FA0272]/10 hover:bg-[#FA0272] text-[#FA0272] hover:text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-bold transition-all duration-300 border border-[#FA0272]/20 cursor-pointer shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Become a Partner</span>
                  <span className="sm:hidden">Join</span>
                </button>
                <button
                  onClick={() => setIsRestaurantOpen(false)}
                  className="group flex items-center gap-1.5 sm:gap-2 bg-slate-900 text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-bold hover:bg-[#FA0272] transition-all duration-300 shadow-md hover:shadow-lg cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Back to Home</span>
                  <span className="sm:hidden">Back</span>
                </button>
              </div>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title - Centered Elegant Culinary Accent */}
              <div className="max-w-4xl space-y-6 text-center mx-auto mb-4">
                <span className="inline-flex items-center gap-2 text-[#FA0272] font-black tracking-widest uppercase text-xs bg-[#FA0272]/10 border border-[#FA0272]/20 px-4 py-2 rounded-full">
                  <Store className="w-4 h-4 text-[#FA0272]" /> Restaurant Empowerment Initiative
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                  Earn Commission-Free. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#FA0272] to-[#E02477] font-extrabold italic font-light">Reclaim 100% of Your Revenue.</span>
                </h1>
                <p className="text-xl text-slate-700 font-light leading-relaxed max-w-3xl mx-auto">
                  Say goodbye to standard 25%-30% commissions that wipe out restaurant profit margins. With SwitchEats, you gain access to a powerful digital ordering system on a <strong>lifetime 0% commission model</strong>.
                </p>
              </div>

              {/* Download CTA Block - Customized as a POS Tablet Terminal Layout */}
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0 flex flex-col lg:flex-row items-center gap-12 border border-slate-800">
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-[#FA0272]/10 rounded-full blur-[90px] pointer-events-none" />

                <div className="flex-1 space-y-6 relative z-10">
                  <div className="inline-block text-[10px] uppercase tracking-widest font-black text-pink-500 bg-[#FA0272]/10 border border-[#FA0272]/20 px-3 py-1.5 rounded-full">
                    Active Operations: Telangana Region
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Setup Your Live Digital Kitchen</h2>
                  <p className="text-slate-400 font-light max-w-xl leading-relaxed text-sm md:text-base">
                    Register your business profile, customize your digital menu, and start receiving commission-free orders directly on your phone or tablet in minutes.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <a
                      href="https://apps.apple.com/in/app/switcheats-partner/id6766466794"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-[#FA0272] hover:text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Apple className="w-5 h-5" /> iOS App Store
                    </a>
                    <a
                      href="https://play.google.com/store/apps/details?id=com.switcheats.restaurant1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-slate-800 border border-slate-700 text-white hover:bg-[#FA0272] hover:border-[#FA0272] px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Play className="w-5 h-5" /> Android Play Store
                    </a>
                  </div>
                </div>

                {/* Conceptual POS Tablet Mockup Graphic */}
                <div className="w-full lg:w-[420px] shrink-0 flex justify-center relative z-10">
                  <div className="w-full max-w-[380px] h-[250px] bg-slate-900 border-4 border-slate-700 rounded-2xl shadow-2xl p-4 flex flex-col justify-between relative overflow-hidden">
                    {/* Tablet Top Notch and bezel look */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-2 bg-slate-700 rounded-full" />

                    {/* POS Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0 mt-1">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-[#FA0272]" />
                        <span className="text-[10px] text-white font-bold tracking-wider uppercase">Live POS Terminal</span>
                      </div>
                      <span className="text-[8px] bg-pink-500/10 text-[#FA0272] px-2 py-0.5 rounded-full font-bold uppercase">Online</span>
                    </div>

                    {/* Middle: Comparison metric */}
                    <div className="grid grid-cols-2 gap-3 py-2 flex-1 items-center">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-center">
                        <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">With SwitchEats</div>
                        <div className="text-sm font-black text-[#FA0272] mt-0.5">₹18,450.00</div>
                        <div className="text-[7px] text-slate-400 mt-0.5">0% Commission Paid</div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-center relative opacity-80">
                        <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Traditional Apps</div>
                        <div className="text-sm font-black text-slate-400 mt-0.5 line-through">₹12,915.00</div>
                        <div className="text-[7px] text-[#FA0272] mt-0.5 font-bold">30% Aggregator Cut</div>
                      </div>
                    </div>

                    {/* POS Footer bar */}
                    <div className="bg-[#FA0272] text-white text-[9px] font-black text-center py-2 rounded-lg uppercase tracking-widest shrink-0">
                      Saving ₹5,535.00 Today
                    </div>
                  </div>
                </div>
              </div>

              {/* Partner Benefits 2x2 Grid - Styled with Elegant Champagne Glassmorphism */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Benefit 1 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#FA0272]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Percent className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Lifetime 0% Commission</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Every order processed through our platform incurs exactly 0% commission. You keep 100% of your earnings to scale your business, hire culinary talents, and maintain operational margins.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empowering Culinary Businesses</span>
                  </div>
                </div>

                {/* Benefit 2 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#FA0272]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Instant Daily Settlements</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Say goodbye to frustrating weekly payout cycles that lock up your operating capital. SwitchEats processes bank settlements daily, keeping your cash flow running smoothly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fast Cash Flow Cycle</span>
                  </div>
                </div>

                {/* Benefit 3 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#FA0272]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Live Menu & Pricing Control</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Easily adjust your digital menu in real-time. Switch items on or off, edit prices directly to protect your margins, customize add-ons, and roll out special promotional offers instantly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Map className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Zero Lag Adjustments</span>
                  </div>
                </div>

                {/* Benefit 4 */}
                <div className="group bg-white/80 border border-slate-200/40 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-[#FA0272]/5 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Deep Customer Analytics</h3>
                    <p className="text-slate-600 font-light leading-relaxed">
                      Know exactly what your customers love. Access user ratings, review order history patterns, track peak delivery hours, and use rich data points to optimize your offerings.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200/50 flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data-Driven Growth</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action and Lead Form */}
              <div id="partner-lead-form" className="py-12 md:py-20 border-t border-slate-200/40 shrink-0 max-w-3xl mx-auto w-full">
                <div className="text-center mb-10">
                  <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Become a Restaurant Partner</h3>
                  <p className="text-slate-600 max-w-lg font-light text-sm md:text-base mx-auto mt-3">
                    Fill out the form below to register your interest, and our onboarding team will contact you to set up your restaurant on SwitchEats.
                  </p>
                </div>

                {leadSuccess ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[#FA0272]/5 border border-[#FA0272]/20 rounded-3xl p-8 text-center space-y-4"
                  >
                    <div className="w-16 h-16 bg-[#FA0272]/10 rounded-full flex items-center justify-center mx-auto text-[#FA0272]">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-bold text-slate-900">Application Submitted Successfully!</h4>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      Thank you for choosing SwitchEats. Our onboarding representative will get in touch with you shortly to finalize your registration.
                    </p>
                    <button
                      onClick={() => setLeadSuccess(false)}
                      className="px-6 py-2.5 text-xs font-bold text-[#FA0272] bg-[#FA0272]/10 hover:bg-[#FA0272]/20 transition-all rounded-full"
                    >
                      Submit Another Inquiry
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleLeadSubmit} className="space-y-5 bg-white border border-slate-200/60 p-6 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-900/5">
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Owner Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: John Doe"
                          value={leadForm.ownerName}
                          onChange={(e) => setLeadForm({ ...leadForm, ownerName: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#FA0272]/20 focus:border-[#FA0272] transition-all text-slate-800"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: The Culinary Hub"
                          value={leadForm.restaurantName}
                          onChange={(e) => setLeadForm({ ...leadForm, restaurantName: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#FA0272]/20 focus:border-[#FA0272] transition-all text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Mobile Number</label>
                        <input
                          type="tel"
                          required
                          placeholder="Ex: +91 98765 43210"
                          value={leadForm.mobileNumber}
                          onChange={(e) => setLeadForm({ ...leadForm, mobileNumber: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#FA0272]/20 focus:border-[#FA0272] transition-all text-slate-800"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Mail ID</label>
                        <input
                          type="email"
                          required
                          placeholder="Ex: partner@domain.com"
                          value={leadForm.emailId}
                          onChange={(e) => setLeadForm({ ...leadForm, emailId: e.target.value })}
                          className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#FA0272]/20 focus:border-[#FA0272] transition-all text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Location / Address</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Madhapur, Hyderabad, Telangana"
                        value={leadForm.location}
                        onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })}
                        className="w-full px-5 py-3.5 text-sm rounded-2xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#FA0272]/20 focus:border-[#FA0272] transition-all text-slate-800"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <button
                        type="submit"
                        disabled={submittingLead}
                        className="flex-1 bg-slate-900 text-white hover:bg-[#FA0272] px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-300 shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {submittingLead ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            Registering Your Lead...
                          </>
                        ) : (
                          "Submit Registration Request"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRestaurantOpen(false)}
                        className="sm:flex-initial bg-slate-100 hover:bg-slate-200 text-slate-700 px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-300 text-center cursor-pointer"
                      >
                        Return to Homepage
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-50 border-t border-slate-200/50 py-8 text-center text-xs text-slate-400 font-medium shrink-0">
              <p>© 2026 {APP_CONFIG?.NAME || "SwitchEats"} Technologies Inc. All rights reserved.</p>
            </footer>
          </motion.div>
        )}

        {isDeliveryOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            data-lenis-prevent
            className="fixed inset-0 z-[100] w-screen h-screen bg-[#07080B] text-slate-100 overflow-y-auto flex flex-col selection:bg-[#FA0272] selection:text-white"
          >
            {/* Ambient Cyberpunk Background Lights - Electric Purple/Indigo and Hot Pink */}
            <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#FA0272]/5 rounded-full blur-[140px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Sticky Cyber Header */}
            <header className="sticky top-0 w-full z-50 px-6 py-6 md:px-12 lg:px-20 flex items-center justify-between bg-[#07080B]/90 backdrop-blur-md border-b border-slate-800/80 shrink-0">
              <div className="text-2xl font-black text-white tracking-tighter">
                {APP_CONFIG?.NAME || "SwitchEats"}
                <span className="text-[#FA0272]">.</span>
              </div>
              <button
                onClick={() => setIsDeliveryOpen(false)}
                className="group flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-5 py-2.5 rounded-full text-xs font-bold hover:bg-[#FA0272] hover:border-[#FA0272] transition-all duration-300 shadow-md hover:shadow-lg cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Home
              </button>
            </header>

            {/* Page Content Container */}
            <main className="flex-1 relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:px-20 flex flex-col gap-12 md:gap-20">

              {/* Cinematic Page Title - Cyber Centered HUD Accent */}
              <div className="max-w-4xl space-y-6 text-center mx-auto mb-4">
                <span className="inline-flex items-center gap-2 text-[#FA0272] font-black tracking-widest uppercase text-xs bg-[#FA0272]/15 border border-[#FA0272]/30 px-4 py-2 rounded-full animate-pulse">
                  <Bike className="w-4 h-4 text-[#FA0272]" /> Active Captain HUD Dashboard
                </span>
                <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-white">
                  Drive on Your Terms. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#FA0272] to-indigo-400 font-extrabold italic font-light">Earn More & Cash Out Faster.</span>
                </h1>
                <p className="text-xl text-slate-400 font-light leading-relaxed max-w-3xl mx-auto">
                  Join the elite squad of SwitchEats Captains. Secure the most competitive distance-based payout structure, absolute route clarity, weekly settlements, and <strong>keep 100% of your customer tips</strong>.
                </p>
              </div>

              {/* Download CTA Block - Customized as a Cyberpunk Navigator Map UI */}
              <div className="bg-slate-950 text-white rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-2xl shrink-0 flex flex-col lg:flex-row items-center gap-12 border border-slate-900">
                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none z-0" />
                <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-[90px] pointer-events-none" />

                <div className="flex-1 space-y-6 relative z-10">
                  <div className="inline-block text-[10px] uppercase tracking-widest font-black text-[#FA0272] bg-[#FA0272]/10 border border-[#FA0272]/20 px-3 py-1.5 rounded-full">
                    Squad Expanding: Telangana Core Hubs
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Join the active delivery crew</h2>
                  <p className="text-slate-400 font-light max-w-xl leading-relaxed text-sm md:text-base">
                    Quick onboarding. Setup your profile, upload identification documents, and start accepting dispatch requests with zero hidden deductions.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <a
                      href="https://apps.apple.com/in/app/switcheats-captain/id6766778164"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-[#FA0272] hover:text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Apple className="w-5 h-5" /> iOS App Store
                    </a>
                    <a
                      href="https://play.google.com/store/apps/details?id=com.switcheats.delivery1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-slate-800 border border-slate-800 text-white hover:bg-[#FA0272] hover:border-[#FA0272] px-8 py-4 rounded-2xl font-bold transition-all duration-300 text-sm shadow-md cursor-pointer text-center"
                    >
                      <Play className="w-5 h-5" /> Android Play Store
                    </a>
                  </div>
                </div>

                {/* Conceptual Live Route HUD Mockup */}
                <div className="w-full lg:w-[350px] shrink-0 flex justify-center relative z-10">
                  <div className="w-[260px] h-[340px] bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] shadow-2xl p-4 flex flex-col justify-between relative overflow-hidden">
                    {/* Top Speaker bezel */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-3 bg-slate-800 rounded-full" />

                    {/* Active State Header */}
                    <div className="flex items-center justify-between mt-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Captain On-Duty</span>
                      </div>
                      <span className="text-[8px] text-[#FA0272] font-black tracking-widest bg-[#FA0272]/15 px-2 py-0.5 rounded border border-[#FA0272]/30">GPS Active</span>
                    </div>

                    {/* Compass/GPS HUD Area */}
                    <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-3 my-2 flex-1 flex flex-col justify-between relative overflow-hidden">
                      <div className="flex items-center justify-between text-[8px] text-slate-400 uppercase tracking-widest">
                        <span>Target Node</span>
                        <span className="text-white font-bold">1.2 km away</span>
                      </div>

                      {/* Fake GPS Path Indicator */}
                      <div className="flex-1 flex items-center justify-center relative my-2">
                        <svg className="w-full h-16" viewBox="0 0 100 40">
                          {/* Dotted target path */}
                          <motion.path
                            d="M10,20 C40,5 60,35 90,20"
                            fill="none"
                            stroke="#FA0272"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            animate={{ strokeDashoffset: [0, -20] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                          />
                          {/* Point A */}
                          <circle cx="10" cy="20" r="3.5" fill="#4F46E5" />
                          {/* Point B */}
                          <circle cx="90" cy="20" r="3.5" fill="#FA0272" className="animate-pulse" />
                        </svg>
                      </div>

                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-slate-500 font-medium">Earned This Trip</span>
                        <span className="text-white font-black">₹185.00 + ₹40 Tip</span>
                      </div>
                    </div>

                    {/* Accept Request button */}
                    <div className="bg-gradient-to-r from-[#FA0272] to-indigo-600 text-white text-[10px] font-black text-center py-2.5 rounded-xl uppercase tracking-wider shrink-0 cursor-pointer shadow-lg shadow-pink-500/20">
                      Deliver Order
                    </div>
                  </div>
                </div>
              </div>

              {/* Captain Benefits 2x2 Grid - Cyberpunk Dark Glass cards */}
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12 shrink-0">

                {/* Benefit 1 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:border-pink-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#FA0272]/10 border border-[#FA0272]/20 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Heart className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Keep 100% Customer Tips</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Every single rupee that a grateful customer tips you belongs entirely to you. SwitchEats takes zero cuts from your extra rewards. Honest payouts, guaranteed.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Respecting Captain Labor</span>
                  </div>
                </div>

                {/* Benefit 2 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:border-pink-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#FA0272]/10 border border-[#FA0272]/20 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Absolute Schedule Freedom</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Work when you want, where you want. No rigid shift systems, no penalty zones. Set your status to active whenever you are ready to earn, and switch off seamlessly.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flexible Lifestyle First</span>
                  </div>
                </div>

                {/* Benefit 3 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:border-pink-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#FA0272]/10 border border-[#FA0272]/20 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Fast Weekly Wallet Payouts</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Never wait weeks to enjoy your hard-earned rewards. SwitchEats settles your total earnings straight into your active digital wallet every single week, cleanly and securely.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Map className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Consistent Financial Flow</span>
                  </div>
                </div>

                {/* Benefit 4 */}
                <div className="group bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-8 lg:p-10 hover:shadow-2xl hover:shadow-pink-500/5 hover:border-pink-500/30 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 rounded-2xl bg-[#FA0272]/10 border border-[#FA0272]/20 flex items-center justify-center text-[#FA0272] mb-6 group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Dedicated Captain Care</h3>
                    <p className="text-slate-400 font-light leading-relaxed">
                      Access 24/7 priority support over chat and phone. Our physical hubs across active regions ensure you always have a dedicated, physical place to resolve any concerns.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#FA0272]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supported Every Mile</span>
                  </div>
                </div>

              </div>

              {/* Bottom Call to Action */}
              <div className="text-center py-12 md:py-20 border-t border-slate-800/80 flex flex-col items-center gap-6 shrink-0">
                <h3 className="text-3xl md:text-4xl font-black text-white">Start Earning with SwitchEats</h3>
                <p className="text-slate-400 max-w-lg font-light text-sm md:text-base">
                  Get on the road and empower the local neighborhood restaurant ecosystem while securing premium distance-based earnings.
                </p>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => setIsDeliveryOpen(false)}
                    className="bg-slate-900 hover:bg-[#FA0272] text-white border border-slate-800 hover:border-[#FA0272] px-8 py-4 rounded-full font-bold text-sm transition-all duration-300 shadow-md cursor-pointer"
                  >
                    Return to Homepage
                  </button>
                </div>
              </div>

            </main>

            {/* Simple Footer */}
            <footer className="bg-slate-950 border-t border-slate-900 py-8 text-center text-xs text-slate-505 font-medium shrink-0">
              <p>© 2026 {APP_CONFIG?.NAME || "SwitchEats"} Technologies Inc. All rights reserved.</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}