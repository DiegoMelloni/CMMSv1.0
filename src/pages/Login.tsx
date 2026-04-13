import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface UserProfile {
  subscription_status: 'active' | 'pending';
}

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Autenticação do usuário
      const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !user) {
        throw authError || new Error('Usuário não encontrado');
      }

      // Busca do perfil do usuário
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('subscription_status')
        .eq('user_id', user.id)
        .single() as { data: UserProfile, error: any };

      if (profileError) {
        throw profileError;
      }

      // Redirecionamento baseado no status
      if (profile.subscription_status === 'pending') {
        navigate('/pagamento-pendente');
      } else {
        navigate('/tags');
      }

    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            <p>Acesse sua Conta</p>CMMS V 1.0
          </h1>
        </div>

        {error && (
          <div 
            role="alert"
            aria-live="assertive"
            className="bg-red-50 border-l-4 border-red-500 p-4"
          >
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Digite seu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby="email-help"
              />
            </div>
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              aria-label={loading ? "Autenticando..." : "Entrar"}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg 
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Autenticando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-sm space-y-3">
          <Link 
            to="/register" 
            className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Não tem uma conta? Registre-se aqui
          </Link>
          
          <div className="pt-2">
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLScFkc3KS3W_jnXmQN2ovC7zv6b_Nc0S0Q-ZWfcEQHVNqsz-zg/viewform?usp=sharing&ouid=118431885359139616101"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Problemas com login? Entre em contato
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;