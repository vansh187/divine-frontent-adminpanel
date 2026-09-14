import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { CustomersListPage } from "./features/customers/CustomersListPage";
import { CustomerDetailPage } from "./features/customers/CustomerDetailPage";
import { BrokersListPage } from "./features/brokers/BrokersListPage";
import { BrokerDetailPage } from "./features/brokers/BrokerDetailPage";
import { SiteVisitsPage } from "./features/siteVisits/SiteVisitsPage";
import { SiteVisitDetailPage } from "./features/siteVisits/SiteVisitDetailPage";
import { BookingsQueuePage } from "./features/bookings/BookingsQueuePage";
import { BookingDetailPage } from "./features/bookings/BookingDetailPage";
import { RefundsPage } from "./features/refunds/RefundsPage";
import { RevenuePage } from "./features/revenue/RevenuePage";
import { AuditLogsPage } from "./features/audit/AuditLogsPage";
import { AdminProfilePage } from "./features/profile/AdminProfilePage";
import { SettlementsListPage } from "./features/settlements/SettlementsListPage";
import { SettlementDetailPage } from "./features/settlements/SettlementDetailPage";
import { HelpPage } from "./features/misc/HelpPage";
import { NotFoundPage } from "./features/misc/NotFoundPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />

      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/signup" element={<SignupPage />} />
      <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="brokers" element={<BrokersListPage />} />
        <Route path="brokers/:id" element={<BrokerDetailPage />} />
        <Route path="site-visits" element={<SiteVisitsPage />} />
        <Route path="site-visits/:id" element={<SiteVisitDetailPage />} />
        <Route path="bookings" element={<BookingsQueuePage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="broker-settlements" element={<SettlementsListPage />} />
        <Route path="broker-settlements/:id" element={<SettlementDetailPage />} />
        <Route path="audit" element={<AuditLogsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
