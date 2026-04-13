import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface TenantData {
  tenant_id: string;
  role: 'user' | 'programmer' | 'admin';
  subscription_status: string;
}

interface AuthContextType {
  tenant: TenantData | null;
  loading: boolean;
  error: string | null;
  isProgrammer: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchTenantData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('tenant_id, role, subscription_status')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        throw error || new Error('Perfil de usuário não encontrado');
      }

      if (data.subscription_status !== 'active') {
        navigate('/pagamento-pendente', { replace: true });
        return;
      }

      setTenant(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  // Listener global de autenticação
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await fetchTenantData(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setTenant(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Verificação inicial da sessão
  useEffect(() => {
    const publicPaths = ['/login', '/register', '/unauthorized', '/pagamento-pendente'];
    
    if (publicPaths.includes(location.pathname)) {
      setLoading(false);
      return;
    }

    const checkInitialSession = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          navigate('/login', { replace: true });
          return;
        }

        await fetchTenantData(user.id);
      } catch (err) {
        navigate('/login', { replace: true });
      }
    };

    checkInitialSession();
  }, [navigate, location.pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    setTenant(null);
    navigate('/login', { replace: true });
  };

  const value = {
    tenant,
    loading,
    error,
    isProgrammer: tenant?.role === 'programmer' || tenant?.role === 'admin',
    isAdmin: tenant?.role === 'admin',
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {loading && !['/login', '/register'].includes(location.pathname) ? (
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);