import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";

const RELOAD_FLAG = "admin_chunk_reload";

/**
 * Pages are split into their own files and downloaded the first time they're opened.
 * After a deploy, a tab opened earlier asks for file names that no longer exist; reload once
 * to pick up the new build instead of showing a broken page.
 */
const page = (load, name) =>
  lazy(() =>
    load()
      .then((mod) => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* storage unavailable */ }
        return { default: mod[name] };
      })
      .catch((error) => {
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
          sessionStorage.setItem(RELOAD_FLAG, "1");
        } catch { /* storage unavailable */ }
        if (!alreadyReloaded) {
          window.location.reload();
          return new Promise(() => {}); // keep showing the loader until the reload happens
        }
        throw error;
      })
  );

// The signed-in shell (and its animation library) isn't needed on the login screen.
const AdminLayout = page(() => import("../layout/AdminLayout.jsx"), "AdminLayout");

const LoginPage = page(() => import("../../features/auth/LoginPage.jsx"), "LoginPage");
const DashboardPage = page(() => import("../../features/dashboard/DashboardPage.jsx"), "DashboardPage");
const DatabaseExplorerPage = page(() => import("../../features/database/DatabaseExplorerPage.jsx"), "DatabaseExplorerPage");
const UsersPage = page(() => import("../../features/users/UsersPage.jsx"), "UsersPage");
const UserProfilePage = page(() => import("../../features/users/UserProfilePage.jsx"), "UserProfilePage");
const ReportsPage = page(() => import("../../features/reports/ReportsPage.jsx"), "ReportsPage");
const WithdrawalsPage = page(() => import("../../features/withdrawals/WithdrawalsPage.jsx"), "WithdrawalsPage");
const TrendingCreatorsPage = page(() => import("../../features/trending/TrendingCreatorsPage.jsx"), "TrendingCreatorsPage");
const VideosPage = page(() => import("../../features/videos/VideosPage.jsx"), "VideosPage");
const BookingsPage = page(() => import("../../features/bookings/BookingsPage.jsx"), "BookingsPage");
const PaymentsPage = page(() => import("../../features/payments/PaymentsPage.jsx"), "PaymentsPage");
const PlatformFeesPage = page(() => import("../../features/platformFees/PlatformFeesPage.jsx"), "PlatformFeesPage");
const CategoriesPage = page(() => import("../../features/categories/CategoriesPage.jsx"), "CategoriesPage");
const HeroSlidesPage = page(() => import("../../features/heroSlides/HeroSlidesPage.jsx"), "HeroSlidesPage");
const SessionsPage = page(() => import("../../features/sessions/SessionsPage.jsx"), "SessionsPage");
const RecordingsPage = page(() => import("../../features/recordings/RecordingsPage.jsx"), "RecordingsPage");
const AuditLogPage = page(() => import("../../features/audit/AuditLogPage.jsx"), "AuditLogPage");

function FullPageLoader({ label }) {
  return (
    <div className="admin-page-loader" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader label="Checking your session…" />;
  // Remember where the admin was heading so login can send them back there.
  return isAuthenticated ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<FullPageLoader label="Loading…" />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Suspense fallback={<FullPageLoader label="Loading…" />}>
              <AdminLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="database" element={<DatabaseExplorerPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserProfilePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="withdrawals" element={<WithdrawalsPage />} />
        <Route path="platform-fees" element={<PlatformFeesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="hero-slides" element={<HeroSlidesPage />} />
        <Route path="trending" element={<TrendingCreatorsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="recordings" element={<RecordingsPage />} />
        <Route path="audit-logs" element={<AuditLogPage />} />
      </Route>
    </Routes>
  );
}
