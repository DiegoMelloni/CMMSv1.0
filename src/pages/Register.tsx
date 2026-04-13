import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nomeEmpresa) {
      setError('Por favor, informe o nome da empresa');
      return;
    }
  
    setLoading(true);
    setError('');
  
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
      });
  
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Erro ao obter ID do usuário');
  
      // Verifica ou cria tenant
      let tenantId: string;
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('name', nomeEmpresa)
        .single();
  
      if (existingTenant) {
        tenantId = existingTenant.id;
      } else {
        const { data: newTenant, error: tenantError } = await supabase
          .from('tenants')
          .insert({ name: nomeEmpresa })
          .select()
          .single();
  
        if (tenantError) throw tenantError;
        tenantId = newTenant.id;
      }
  
      // Cria perfil com status pendente
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          role: role,
          subscription_status: 'pending',
        });
  
      if (profileError) throw profileError;
  
      // Redireciona para Kirvano
      const KIRVANO_CHECKOUTS = {
        programmer: 'https://pay.kirvano.com/aa8f0fbe-a04c-4bf5-a40f-0b9306519db0',
        user: 'https://pay.kirvano.com/17e596fd-af79-4c6c-ad75-ce97a471a3d2',
      };
      
      const checkoutUrl = `${KIRVANO_CHECKOUTS[role]}?user_id=${userId}`;
      window.location.href = checkoutUrl;
  
    } catch (error: any) {
      setError(error.message || 'Erro durante o cadastro');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center text-gray-900">Cadastro</h2>
        
        {error && (
          <div 
            role="alert"
            aria-live="assertive"
            className="bg-red-50 border-l-4 border-red-500 p-4"
          >
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="empresa" className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Empresa
              </label>
              <input
                id="empresa"
                name="empresa"
                type="text"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Nome da empresa (existente ou nova)"
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Se a empresa já existir, você será vinculado a ela
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700 mb-2">
                Tipo de usuário
              </legend>
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    id="role-user"
                    name="role"
                    type="radio"
                    value="user"
                    checked={role === 'user'}
                    onChange={() => setRole('user')}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <label htmlFor="role-user" className="ml-2 block text-sm text-gray-700">
                    Usuário Comum
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="role-programmer"
                    name="role"
                    type="radio"
                    value="programmer"
                    checked={role === 'programmer'}
                    onChange={() => setRole('programmer')}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <label htmlFor="role-programmer" className="ml-2 block text-sm text-gray-700">
                    Programador de Manutenção
                  </label>
                </div>
              </div>
            </fieldset>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            aria-label={loading ? "Cadastrando..." : "Cadastrar"}
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
                Cadastrando...
              </span>
            ) : (
              'Cadastrar'
            )}
          </button>
        </form>

        <p className="text-center text-sm mt-4">
          Já tem uma conta?{' '}
          <Link 
            to="/login" 
            className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Faça login aqui
          </Link>
        </p>
      </div>
    </div>
  );
}