import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { BossOnlyRoute, ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import { ForgotPassword, ResetPassword } from './pages/PasswordPages.jsx';
import { PrivacyPolicy, TermsOfUse } from './pages/LegalPages.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Purchases from './pages/Purchases.jsx';
import PurchaseForm from './pages/PurchaseForm.jsx';
import PurchaseDetail from './pages/PurchaseDetail.jsx';
import Products from './pages/Products.jsx';
import PriceHistory from './pages/PriceHistory.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Trash from './pages/Trash.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfUse />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/purchases/new" element={<PurchaseForm />} />
              <Route path="/purchases/:id" element={<PurchaseDetail />} />
              <Route path="/purchases/:id/edit" element={<PurchaseForm />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<PriceHistory />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/profile" element={<Profile />} />

              <Route element={<BossOnlyRoute />}>
                <Route path="/reports" element={<Reports />} />
                <Route path="/users" element={<Users />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/trash" element={<Trash />} />
              </Route>
            </Route>
          </Route>

          <Route path="/app" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
