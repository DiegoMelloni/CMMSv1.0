import React, { useEffect, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { 
  Tag, 
  Wrench, 
  Factory, 
  ChartColumnBig, 
  ClipboardCheck, 
  Package, 
  ChartGantt, 
  LogOut,
  Headphones // Novo ícone de suporte
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: ChartColumnBig, role: 'programmer' },
  { name: 'Gantt', href: '/gantt', icon: ChartGantt, role: 'programmer' },
  { name: 'Etiquetas', href: '/tags', icon: Tag, role: 'user' },
  { name: 'Ordens', href: '/orders', icon: Wrench, role: 'programmer' },
  { name: 'Equipamentos', href: '/equipment', icon: Factory, role: 'user' },
  { name: 'Materiais', href: '/materiais', icon: Package, role: 'programmer' },
  { name: 'Preventivas', href: '/preventivas', icon: ClipboardCheck, role: 'programmer' },
  // Novo item de suporte para todos os usuários
  { name: 'Suporte', href: '/suporte', icon: Headphones, role: 'user' }
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isProgrammer } = useAuth();
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setNavReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Erro ao fazer logout:', error.message);
      alert('Erro ao desconectar. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-lg flex flex-col transition-opacity duration-300">
          <div className="flex h-16 items-center justify-center border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">CMMS v1</h1>
          </div>
          
          <nav className="mt-6 flex-1">
            {!navReady ? (
              <div className="px-2 space-y-1">
                {[...Array(8)].map((_, i) => ( // Aumentado para 8 itens
                  <div key={i} className="h-8 bg-gray-200 animate-pulse rounded-md"></div>
                ))}
              </div>
            ) : (
              <ul className="space-y-1 px-2">
                {navigation.map((item) => {
                  if (item.role === 'programmer' && !isProgrammer) return null;
                  
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  
                  return (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={`group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors
                          ${isActive 
                            ? 'bg-gray-100 text-gray-900' 
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon
                          className={`mr-3 h-5 w-5 flex-shrink-0 
                            ${isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'}
                          `}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="group flex items-center w-full rounded-md px-2 py-2 text-sm font-medium 
                text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 
                focus:ring-indigo-500 transition-colors"
              aria-label="Sair do sistema"
            >
              <LogOut 
                className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" 
                aria-hidden="true"
              />
              Sair
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {!navReady ? (
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 animate-pulse rounded w-1/3"></div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-lg"></div>
                  ))}
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}