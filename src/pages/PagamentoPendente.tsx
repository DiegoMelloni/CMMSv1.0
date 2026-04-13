import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom'; // Added Link import here

export default function PagamentoPendente() {
  const navigate = useNavigate();
  const KIRVANO_CHECKOUTS = {
    programmer: 'https://pay.kirvano.com/aa8f0fbe-a04c-4bf5-a40f-0b9306519db0',
    user: 'https://pay.kirvano.com/17e596fd-af79-4c6c-ad75-ce97a471a3d2',
  };

  const handleCheckoutRedirect = async () => {
    try {
      // Obtém a sessão do usuário
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/login');
        return;
      }

      // Obtém o perfil do usuário para saber o role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        throw new Error('Perfil do usuário não encontrado');
      }

      // Redireciona para o checkout apropriado
      const checkoutUrl = `${KIRVANO_CHECKOUTS[profile.role]}?user_id=${user.id}`;
      window.location.href = checkoutUrl;
      
    } catch (error) {
      console.error('Erro ao redirecionar para checkout:', error);
      navigate('/register'); // Fallback para registro se algo der errado
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
        <h1 className="text-3xl font-bold text-center text-indigo-700 mb-4">
          Pagamento Pendente
        </h1>
        <p className="text-center text-gray-700 mb-6">
          Seu pagamento ainda não foi confirmado. Para liberar o acesso, finalize o pagamento no checkout.
        </p>
        <p className="text-center text-gray-700 mb-6">
          Se você já realizou o pagamento, aguarde alguns minutos para a confirmação automática.
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={handleCheckoutRedirect}
            className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
          >
            Finalizar Pagamento
          </button>
          <Link
            to="/login"
            className="px-6 py-2 border border-indigo-600 text-indigo-600 rounded hover:bg-indigo-100 transition"
          >
            Fazer Login
          </Link>
        </div>
      </div>
    </div>
  );
}