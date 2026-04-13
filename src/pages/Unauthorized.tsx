// pages/Unauthorized.tsx
import { useNavigate } from 'react-router-dom';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Acesso Restrito</h1>
        <p className="text-gray-600 mb-6">
          Você não tem permissão para acessar esta página. Apenas programadores de manutenção podem visualizar este conteúdo.
        </p>
        <button
          onClick={() => navigate('/tags')}
          className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition"
        >
          Voltar para a página inicial
        </button>
      </div>
    </div>
  );
}