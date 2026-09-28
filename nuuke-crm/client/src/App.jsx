import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MyWorkPage from './pages/MyWorkPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import SquadsPage from './pages/SquadsPage.jsx';
import CapacityPage from './pages/CapacityPage.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import PortalPage from './pages/PortalPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const STAFF = ['ADMIN', 'MANAGER', 'MEMBER'];
const LEADS = ['ADMIN', 'MANAGER'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* The client portal stands on its own — no staff chrome, no board routes. */}
      <Route
        path="/portal"
        element={<ProtectedRoute roles={['CLIENT']}><PortalPage /></ProtectedRoute>}
      />

      <Route
        element={<ProtectedRoute roles={STAFF}><AppShell /></ProtectedRoute>}
      >
        <Route index element={<MyWorkPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="board/:resource" element={<BoardPage />} />
        <Route path="squads" element={<SquadsPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />
        <Route
          path="capacity"
          element={<ProtectedRoute roles={LEADS}><CapacityPage /></ProtectedRoute>}
        />
        <Route
          path="portal-preview"
          element={<ProtectedRoute roles={LEADS}><PortalPage preview /></ProtectedRoute>}
        />
        <Route
          path="users"
          element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>}
        />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
