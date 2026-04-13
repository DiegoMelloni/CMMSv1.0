import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionCheck } from '../hooks/useSubscriptionCheck';

interface Equipment {
  id: string;
  name: string;
  tenant_id: string;
}

interface DashboardData {
  totalOpenOrders: number;
  totalCompletedOrders: number;
  totalPendingTags: number;
  totalScheduledTags: number;
  totalOpenTags: number;
  executorStats: Array<{ executor: string; Pendente: number; Confirmada: number }>;
  maintenanceTypeStats: Array<{ type: string; count: number }>;
  executorUsageStats: Array<{ executor: string; percentage: number; totalHours: number; availableHours: number }>;
  recentOrders: Array<{
    id: string;
    order_number: string;
    status: string;
    executor: string;
    execution_date: string;
    description: string;
  }>;
  recentTags: Array<{
    id: string;
    tag_number: string;
    status: string;
    requester: string;
    maintenance_type: string;
    description: string;
  }>;
}

const ExecutorTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border rounded shadow">
        <p className="font-semibold">{label}</p>
        <p>{`Utilização: ${payload[0].value.toFixed(2)}%`}</p>
        <p>{`Horas programadas: ${payload[0].payload.totalHours.toFixed(2)}h`}</p>
        <p>{`Horas disponíveis: ${payload[0].payload.availableHours}h`}</p>
      </div>
    );
  }
  return null;
};

export function Dashboard() {
  const navigate = useNavigate();
  const { tenant, loading: authLoading } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalOpenOrders: 0,
    totalCompletedOrders: 0,
    totalPendingTags: 0,
    totalScheduledTags: 0,
    totalOpenTags: 0,
    executorStats: [],
    maintenanceTypeStats: [],
    executorUsageStats: [],
    recentOrders: [],
    recentTags: [],
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    executor: '',
  });
  const [executors, setExecutors] = useState<string[]>([]);
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [selectedMachine, setSelectedMachine] = useState('');

  useEffect(() => {
    if (!tenant?.tenant_id) return;

    const fetchMachines = async () => {
      const { data } = await supabase
        .from('equipment_hierarchy')
        .select('id, name, tenant_id')
        .eq('type', 'Maquina')
        .eq('tenant_id', tenant.tenant_id)
        .order('name');
      setMachines(data || []);
    };

    const fetchData = async () => {
      try {
        setLoading(true);
        
        let tagsQuery = supabase
          .from('maintenance_tags')
          .select('id, tag_number, status, requester, maintenance_type, description, created_at, machine_id')
          .eq('tenant_id', tenant.tenant_id);

        if (filters.startDate && filters.endDate) {
          tagsQuery = tagsQuery
            .gte('created_at', parseDateFilter(filters.startDate))
            .lte('created_at', parseDateFilter(filters.endDate, true));
        }

        if (selectedMachine) {
          tagsQuery = tagsQuery.eq('machine_id', selectedMachine);
        }

        const { data: tags, error: tagsError } = await tagsQuery;
        if (tagsError) throw tagsError;

        const tagIds = tags?.map(tag => tag.id) || [];

        let ordersQuery = supabase
          .from('maintenance_orders')
          .select('id, order_number, status, executor, execution_date, duration, description, confirmation_date, tag_id')
          .in('tag_id', tagIds);

        if (filters.startDate && filters.endDate) {
          ordersQuery = ordersQuery
            .gte('execution_date', parseDateFilter(filters.startDate))
            .lte('execution_date', parseDateFilter(filters.endDate, true));
        }

        if (filters.executor) {
          ordersQuery = ordersQuery.ilike('executor', `%${filters.executor}%`);
        }

        const { data: orders, error: ordersError } = await ordersQuery;
        if (ordersError) throw ordersError;

        const processedData = processDashboardData(orders || [], tags || []);
        setDashboardData(processedData);

        const uniqueExecutors = [...new Set(orders?.map(order => order.executor).filter(Boolean))];
        setExecutors(uniqueExecutors as string[]);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMachines();
    fetchData();
  }, [tenant, filters, selectedMachine]);

  const parseDateFilter = (dateString: string, isEndOfDay = false) => {
    const date = new Date(dateString);
    if (isEndOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }
    return date.toISOString();
  };

  const processDashboardData = (orders: any[], tags: any[]): DashboardData => {
    const totalOpenOrders = orders.filter(order => order.status !== 'Confirmada').length;
    const totalCompletedOrders = orders.filter(order => order.status === 'Confirmada').length;
    const totalPendingTags = tags.filter(tag => tag.status === 'Pendente').length;
    const totalScheduledTags = tags.filter(tag => tag.status === 'Programada').length;
    const totalOpenTags = totalPendingTags + totalScheduledTags;

    const executorStats = orders.reduce((acc: any, order) => {
      const executor = order.executor || 'Não informado';
      if (!acc[executor]) {
        acc[executor] = { Pendente: 0, Confirmada: 0 };
      }
      const statusKey = order.status === 'Confirmada' ? 'Confirmada' : 'Pendente';
      acc[executor][statusKey]++;
      return acc;
    }, {});

    const maintenanceTypeStats = tags.reduce((acc: any, tag) => {
      if (tag.status !== 'Confirmada') {
        const type = tag.maintenance_type || 'Não informado';
        acc[type] = (acc[type] || 0) + 1;
      }
      return acc;
    }, {});

    const executorUsageStats = calculateExecutorUsage(orders, filters.startDate, filters.endDate);

    return {
      totalOpenOrders,
      totalCompletedOrders,
      totalPendingTags,
      totalScheduledTags,
      totalOpenTags,
      executorStats: Object.entries(executorStats).map(([executor, counts]) => ({
        executor,
        ...counts as { Pendente: number, Confirmada: number }
      })),
      maintenanceTypeStats: Object.entries(maintenanceTypeStats).map(([type, count]) => ({
        type,
        count: count as number
      })),
      executorUsageStats,
      recentOrders: orders.filter(o => o.status !== 'Confirmada').slice(0, 5),
      recentTags: tags.filter(t => t.status !== 'Confirmada').slice(0, 5),
    };
  };

  const calculateExecutorUsage = (orders: any[], startDate?: string, endDate?: string) => {
    if (orders.length === 0) return [];

    let totalAvailableHours = 0;
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      let workingDays = 0;
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const utcDay = currentDate.getUTCDay();
        if (utcDay !== 0 && utcDay !== 6) {
          workingDays++;
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
      
      totalAvailableHours = workingDays * 8;
    }

    const executorHours = orders.reduce((acc, order) => {
      if (!order.executor) return acc;
      
      const executor = order.executor;
      const hours = Number(order.duration) || 0;
      
      if (!acc[executor]) {
        acc[executor] = { totalHours: 0 };
      }
      
      acc[executor].totalHours += hours;
      return acc;
    }, {} as Record<string, { totalHours: number }>);

    return Object.entries(executorHours).map(([executor, data]) => {
      const availableHours = startDate && endDate ? totalAvailableHours : 8;
      const percentage = availableHours > 0 
        ? Math.min((data.totalHours / availableHours) * 100, 100)
        : 0;
      
      return {
        executor,
        percentage: Number(percentage.toFixed(2)),
        totalHours: data.totalHours,
        availableHours
      };
    });
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      executor: '',
    });
    setSelectedMachine('');
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>, isEndDate = false) => {
    const value = e.target.value;
    setFilters(prev => ({
      ...prev,
      [isEndDate ? 'endDate' : 'startDate']: value ? `${value}T${isEndDate ? '23:59' : '00:00'}` : ''
    }));
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de Manutenção</h1>
        {loading && (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            <span className="ml-2 text-gray-600">Carregando dados...</span>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label 
              htmlFor="startDate" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Data Inicial
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={filters.startDate.split('T')[0]}
              onChange={(e) => handleDateChange(e)}
              className="p-2 border rounded w-full"
            />
          </div>
          <div>
            <label 
              htmlFor="endDate" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Data Final
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              value={filters.endDate.split('T')[0]}
              onChange={(e) => handleDateChange(e, true)}
              className="p-2 border rounded w-full"
            />
          </div>
          <div>
            <label 
              htmlFor="executor" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Executante
            </label>
            <div className="relative">
              <input
                id="executor"
                name="executor"
                type="text"
                list="executors-list"
                value={filters.executor}
                onChange={(e) => setFilters({ ...filters, executor: e.target.value })}
                className="p-2 border rounded w-full"
                placeholder="Selecione um executante"
              />
              <datalist id="executors-list">
                {executors.map((executor, index) => (
                  <option key={index} value={executor} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label 
              htmlFor="machine" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Máquina
            </label>
            <select
              id="machine"
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="p-2 border rounded w-full"
            >
              <option value="">Todas</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={handleResetFilters}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded w-full"
              aria-label="Limpar filtros"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-indigo-500">
          <h3 className="text-sm font-medium text-gray-500">Ordens Abertas</h3>
          <p className="text-2xl font-bold text-indigo-600">{dashboardData.totalOpenOrders}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-500">Ordens Confirmadas</h3>
          <p className="text-2xl font-bold text-green-600">{dashboardData.totalCompletedOrders}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
          <h3 className="text-sm font-medium text-gray-500">Etiquetas Pendentes</h3>
          <p className="text-2xl font-bold text-yellow-600">{dashboardData.totalPendingTags}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-500">Etiquetas Programadas</h3>
          <p className="text-2xl font-bold text-blue-600">{dashboardData.totalScheduledTags}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
          <h3 className="text-sm font-medium text-gray-500">Etiquetas Abertas</h3>
          <p className="text-2xl font-bold text-purple-600">{dashboardData.totalOpenTags}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Ordens por Executor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.executorStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="executor" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Pendente" fill="#F59E0B" name="Pendente" />
                <Bar dataKey="Confirmada" fill="#10B981" name="Confirmada" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Etiquetas por Tipo de Manutenção</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.maintenanceTypeStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Legend formatter={() => 'Qtde de Etiquetas'} />
                <Bar dataKey="count" fill="#8B5CF6" name="Qtde de Etiquetas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Utilização por Executor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.executorUsageStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="executor" />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip content={<ExecutorTooltip />} />
                <Legend />
                <Bar dataKey="percentage" fill="#4F46E5" name="% Utilizado" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Últimas Ordens Pendentes</h3>
            <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
              {dashboardData.totalOpenOrders} totais
            </span>
          </div>
          <ul className="space-y-4">
            {dashboardData.recentOrders.length > 0 ? (
              dashboardData.recentOrders.map(order => (
                <li key={order.id} className="space-y-1 p-2 hover:bg-gray-50 rounded">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">#{order.order_number}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      order.status === 'Programada' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{order.executor || 'Não informado'}</p>
                  <p className="text-xs text-gray-500">{order.execution_date || 'Sem data'}</p>
                  <p className="text-xs text-gray-500 truncate" title={order.description}>
                    {order.description || 'Sem descrição'}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-center text-gray-500 py-4">Nenhuma ordem pendente</li>
            )}
          </ul>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Últimas Etiquetas Abertas</h3>
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
              {dashboardData.totalOpenTags} totais
            </span>
          </div>
          <ul className="space-y-4">
            {dashboardData.recentTags.length > 0 ? (
              dashboardData.recentTags.map(tag => (
                <li key={tag.id} className="space-y-1 p-2 hover:bg-gray-50 rounded">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">#{tag.tag_number}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      tag.status === 'Programada' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {tag.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{tag.requester || 'Não informado'}</p>
                  <p className="text-xs text-gray-500">{tag.maintenance_type || 'Tipo não informado'}</p>
                  <p className="text-xs text-gray-500 truncate" title={tag.description}>
                    {tag.description || 'Sem descrição'}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-center text-gray-500 py-4">Nenhuma etiqueta aberta</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}