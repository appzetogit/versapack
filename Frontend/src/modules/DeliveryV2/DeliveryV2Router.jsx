import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AuthRedirect from "@food/components/AuthRedirect"
import Loader from "@food/components/Loader";
import { applyModuleBranding, getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings";

// Auth Pages (Lazy loaded)
const Welcome = lazy(() => import("./pages/auth/Welcome"))
const SignIn = lazy(() => import("./pages/auth/SignIn"))
const OTP = lazy(() => import("./pages/auth/OTP"))
const SignupStep1 = lazy(() => import("./pages/auth/SignupStep1"))
const SignupStep2 = lazy(() => import("./pages/auth/SignupStep2"))

// V2 Pages (Lazy loaded)
const DeliveryHomeV2 = lazy(() => import('./pages/DeliveryHomeV2'));
const PayoutV2 = lazy(() => import('./pages/pocket/PayoutV2').then((m) => ({ default: m.PayoutV2 })));
const PocketStatementV2 = lazy(() => import('./pages/pocket/PocketStatementV2').then((m) => ({ default: m.PocketStatementV2 })));
const DeductionStatementV2 = lazy(() => import('./pages/pocket/DeductionStatementV2').then((m) => ({ default: m.DeductionStatementV2 })));
const LimitSettlementV2 = lazy(() => import('./pages/pocket/LimitSettlementV2').then((m) => ({ default: m.LimitSettlementV2 })));
const PocketBalanceV2 = lazy(() => import('./pages/pocket/PocketBalanceV2').then((m) => ({ default: m.PocketBalanceV2 })));
const CashLimitInfoV2 = lazy(() => import('./pages/pocket/CashLimitInfoV2').then((m) => ({ default: m.CashLimitInfoV2 })));
const ProfileBankV2 = lazy(() => import('./pages/profile/ProfileBankV2').then((m) => ({ default: m.ProfileBankV2 })));
const ProfileDocsV2 = lazy(() => import('./pages/profile/ProfileDocsV2').then((m) => ({ default: m.ProfileDocsV2 })));
const SupportTicketsV2 = lazy(() => import('./pages/help/SupportTicketsV2').then((m) => ({ default: m.SupportTicketsV2 })));
const CreateSupportTicketV2 = lazy(() => import('./pages/help/CreateSupportTicketV2').then((m) => ({ default: m.CreateSupportTicketV2 })));
const ViewSupportTicketV2 = lazy(() => import('./pages/help/ViewSupportTicketV2').then((m) => ({ default: m.ViewSupportTicketV2 })));
const OrderEmergencyRequestsV2 = lazy(() => import('./pages/help/OrderEmergencyRequestsV2').then((m) => ({ default: m.OrderEmergencyRequestsV2 })));
const ShowIdCardV2 = lazy(() => import('./pages/help/ShowIdCardV2'));
const PocketDetailsV2 = lazy(() => import('./pages/pocket/PocketDetailsV2').then((m) => ({ default: m.PocketDetailsV2 })));
const ProfileDetailsV2 = lazy(() => import('./pages/profile/ProfileDetailsV2').then((m) => ({ default: m.ProfileDetailsV2 })));
const TermsAndConditionsV2 = lazy(() => import('./pages/TermsAndConditionsV2'));
const PrivacyPolicyV2 = lazy(() => import('./pages/PrivacyPolicyV2'));
const HelpContentV2 = lazy(() => import('./pages/HelpContentV2'));
const NotificationsV2 = lazy(() => import('./pages/NotificationsV2'));

const DeliveryV2Router = () => {
  // Safely enforce light mode for the Delivery app to prevent User dark mode bleeding
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const savedTheme = localStorage.getItem('appTheme') || 'light';
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    const applyBranding = async () => {
      const cached = getCachedSettings();
      if (cached) {
        applyModuleBranding("delivery", cached);
      } else {
        const settings = await loadBusinessSettings();
        applyModuleBranding("delivery", settings);
      }
    };

    applyBranding();
    const handleSettingsUpdate = () => applyBranding();
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate);
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate);
  }, []);

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth routes */}
        <Route path="welcome" element={<AuthRedirect module="delivery"><Welcome /></AuthRedirect>} />
        <Route path="login" element={<AuthRedirect module="delivery"><SignIn /></AuthRedirect>} />
        <Route path="otp" element={<AuthRedirect module="delivery"><OTP /></AuthRedirect>} />
        <Route path="signup" element={<Navigate to="/food/delivery/login" replace />} />
        <Route path="signup/details" element={<AuthRedirect module="delivery"><SignupStep1 /></AuthRedirect>} />
        <Route path="signup/documents" element={<AuthRedirect module="delivery"><SignupStep2 /></AuthRedirect>} />
        <Route path="terms" element={<TermsAndConditionsV2 />} />

        {/* Protected Core Routes */}
        <Route path="" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="feed" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="pocket" element={<ProtectedRoute><DeliveryHomeV2 tab="pocket" /></ProtectedRoute>} />
        <Route path="history" element={<ProtectedRoute><DeliveryHomeV2 tab="history" /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><DeliveryHomeV2 tab="profile" /></ProtectedRoute>} />
        <Route path="notifications" element={<ProtectedRoute><NotificationsV2 /></ProtectedRoute>} />
        <Route path="profile/details" element={<ProtectedRoute><ProfileDetailsV2 /></ProtectedRoute>} />
        <Route path="profile/bank" element={<ProtectedRoute><ProfileBankV2 /></ProtectedRoute>} />
        <Route path="profile/documents" element={<ProtectedRoute><ProfileDocsV2 /></ProtectedRoute>} />
        
        {/* Support Systems */}
        <Route path="help/tickets" element={<ProtectedRoute><SupportTicketsV2 /></ProtectedRoute>} />
        <Route path="help/tickets/create" element={<ProtectedRoute><CreateSupportTicketV2 /></ProtectedRoute>} />
        <Route path="help/tickets/:ticketId" element={<ProtectedRoute><ViewSupportTicketV2 /></ProtectedRoute>} />
        <Route path="help/order-emergency" element={<ProtectedRoute><OrderEmergencyRequestsV2 /></ProtectedRoute>} />
        <Route path="help/id-card" element={<ProtectedRoute><ShowIdCardV2 /></ProtectedRoute>} />
        <Route path="help/content" element={<HelpContentV2 />} />
        
        {/* CMS Legal Pages */}
        <Route path="profile/terms" element={<TermsAndConditionsV2 />} />
        <Route path="profile/privacy" element={<PrivacyPolicyV2 />} />
        
        {/* Financial Deep-Pages */}
        <Route path="pocket/payout" element={<ProtectedRoute><PayoutV2 /></ProtectedRoute>} />
        <Route path="pocket/statement" element={<ProtectedRoute><PocketStatementV2 /></ProtectedRoute>} />
        <Route path="pocket/deductions" element={<ProtectedRoute><DeductionStatementV2 /></ProtectedRoute>} />
        <Route path="pocket/limit-settlement" element={<ProtectedRoute><LimitSettlementV2 /></ProtectedRoute>} />
        <Route path="pocket/balance" element={<ProtectedRoute><PocketBalanceV2 /></ProtectedRoute>} />
        <Route path="pocket/cash-limit" element={<ProtectedRoute><CashLimitInfoV2 /></ProtectedRoute>} />
        <Route path="pocket/details" element={<ProtectedRoute><PocketDetailsV2 /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/food/delivery" replace />} />
      </Routes>
    </Suspense>
  );
};

export default DeliveryV2Router;
