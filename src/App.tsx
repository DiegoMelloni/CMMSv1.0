import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { createGlobalStyle } from 'styled-components';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Dashboard } from './pages/Dashboard';
import MaintenanceGantt from './pages/MaintenanceGantt';
import MaintenanceTags from './pages/MaintenanceTags';
import { MaintenanceOrders } from './pages/MaintenanceOrders';
import { EquipmentTree } from './pages/EquipmentTree';
import MaterialsManagement from './pages/MaterialsManagement';
import PreventiveMaintenancePage from './pages/PreventiveMaintenancePage';
import Login from './pages/Login';
import Register from './pages/Register';
import Unauthorized from './pages/Unauthorized';
import PagamentoPendente from './pages/PagamentoPendente';
import SupportLink from './components/SupportLink';
import { supabase } from './lib/supabase';

const GlobalStyle = createGlobalStyle`
  * {
    transition: background-color 0.3s ease, opacity 0.3s ease;
  }

  .session-error-banner {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
    padding: 1rem;
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: slideIn 0.3s ease-out;

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
  }
`;

const AuthWrapper = ({ children }: { children: JSX.Element }) => {
  const { tenant, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && error.includes('subscription')) {
    return <Navigate to="/pagamento-pendente" replace />;
  }

  return tenant ? children : <Navigate to="/login" replace />;
};

const RoleCheck = ({ children, requiredRole }: { 
  children: JSX.Element;
  requiredRole: 'user' | 'programmer' | 'admin';
}) => {
  const { tenant, isProgrammer, isAdmin } = useAuth();

  if (!tenant) return <Navigate to="/login" replace />;
  
  const hasAccess = () => {
    const roles = {
      user: true,
      programmer: isProgrammer,
      admin: isAdmin
    };
    return roles[requiredRole];
  };

  return hasAccess() ? children : <Navigate to="/unauthorized" replace />;
};

function AppContent() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('error') === 'session_revoked') {
      setSessionError(true);
    }

    const channel = supabase.channel('session-events')
      .on('broadcast', { event: 'session_revoked' }, () => {
        logout();
        navigate('/login?error=session_revoked');
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [location.search, logout, navigate]);

  return (
    <>
      <GlobalStyle />
      
      {sessionError && (
        <div className="session-error-banner">
          <span className="text-red-600">Sessão expirada ou conflito de login detectado</span>
          <button 
            onClick={() => setSessionError(false)}
            className="text-red-800 hover:text-red-900 font-medium"
          >
            Fechar
          </button>
        </div>
      )}

      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/pagamento-pendente" element={<PagamentoPendente />} />

        {/* Rotas protegidas */}
        <Route element={<AuthWrapper><Layout /></AuthWrapper>}>
          <Route index element={
            <RoleCheck requiredRole="user">
              <Navigate to="/tags" replace />
            </RoleCheck>
          } />

          <Route path="/tags" element={
            <RoleCheck requiredRole="user">
              <MaintenanceTags />
            </RoleCheck>
          } />

          <Route path="/equipment" element={
            <RoleCheck requiredRole="user">
              <EquipmentTree />
            </RoleCheck>
          } />

          <Route path="/dashboard" element={
            <RoleCheck requiredRole="programmer">
              <Dashboard />
            </RoleCheck>
          } />

          <Route path="/orders" element={
            <RoleCheck requiredRole="programmer">
              <MaintenanceOrders />
            </RoleCheck>
          } />

          <Route path="/gantt" element={
            <RoleCheck requiredRole="programmer">
              <MaintenanceGantt />
            </RoleCheck>
          } />

          <Route path="/materiais" element={
            <RoleCheck requiredRole="programmer">
              <MaterialsManagement />
            </RoleCheck>
          } />

          <Route path="/preventivas" element={
            <RoleCheck requiredRole="programmer">
              <PreventiveMaintenancePage />
            </RoleCheck>
          } />

          <Route path="/suporte" element={
            <RoleCheck requiredRole="user">
              <SupportLink />
            </RoleCheck>
          } />
        </Route>

        {/* Rota curinga */}
        <Route path="*" element={<Navigate to="/tags" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
