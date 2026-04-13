import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface TenantData {
  tenant_id: string;
  role: 'user' | 'programmer' | 'admin';
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

  useEffect(() => {
    const publicPaths = ['/login', '/register', '/unauthorized'];

    // Se for rota pública, não precisa autenticar nem buscar dados
    if (publicPaths.includes(location.pathname)) {
      setLoading(false);
      return;
    }

    const fetchTenantData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          navigate('/login', { replace: true });
          return;
        }

        const { data, error: profileError } = await supabase
          .from('user_profiles')
          .select('tenant_id, role')
          .eq('user_id', user.id)
          .single();

        if (profileError || !data) {
          throw new Error(profileError?.message || 'Perfil de usuário não encontrado');
        }

        setTenant(data);
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        setError((error as Error).message);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchTenantData();
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
      {loading ? (
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
