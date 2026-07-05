import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { LoginPage } from "../../features/auth/LoginPage.jsx";
import { AdminLayout } from "../layout/AdminLayout.jsx";
import { DashboardPage } from "../../features/dashboard/DashboardPage.jsx";
import { DatabaseExplorerPage } from "../../features/database/DatabaseExplorerPage.jsx";
import { UsersPage } from "../../features/users/UsersPage.jsx";
import { BookingsPage } from "../../features/bookings/BookingsPage.jsx";
import { PaymentsPage } from "../../features/payments/PaymentsPage.jsx";
import { PlatformFeesPage } from "../../features/platformFees/PlatformFeesPage.jsx";
import { SessionsPage } from "../../features/sessions/SessionsPage.jsx";
import { RecordingsPage } from "../../features/recordings/RecordingsPage.jsx";
import { AuditLogPage } from "../../features/audit/AuditLogPage.jsx";
import { CategoriesPage } from "../../features/categories/CategoriesPage.jsx";
import { MentorProfilesPage } from "../../features/mentorProfiles/MentorProfilesPage.jsx";
import { HeroSlidesPage } from "../../features/heroSlides/HeroSlidesPage.jsx";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="database" element={<DatabaseExplorerPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="mentor-profiles" element={<MentorProfilesPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="platform-fees" element={<PlatformFeesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="hero-slides" element={<HeroSlidesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="recordings" element={<RecordingsPage />} />
        <Route path="audit-logs" element={<AuditLogPage />} />
      </Route>
    </Routes>
  );
}
