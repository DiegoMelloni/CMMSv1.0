import React, { useState, useEffect, useRef } from 'react';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  addHours, 
  format, 
  parseISO, 
  eachDayOfInterval,
  isValid,
  isSameDay,
  isAfter,
  isBefore
} from 'date-fns';
import { supabase } from '../lib/supabase';

registerAllModules();

Handsontable.cellTypes.registerCellType('customGantt', {
  renderer(instance, td, row, col, prop, value) {
    td.innerText = '';
    td.style.padding = '2px';
    td.style.position = 'relative';
    
    if (value) {
      const rowData = instance.getSourceDataAtRow(row);
      const status = rowData.status;
      const barColor = status === 'Confirmada' ? '#10B981' : '#4F46E5';

      const bar = document.createElement('div');
      bar.style.backgroundColor = barColor;
      bar.style.height = '20px';
      bar.style.borderRadius = '4px';
      bar.style.position = 'absolute';
      bar.style.left = '2px';
      bar.style.right = '2px';
      bar.style.top = '2px';
      td.appendChild(bar);
    }
  }
});

const MaintenanceGantt = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [timelineColumns, setTimelineColumns] = useState<any[]>([]);
  const [hotData, setHotData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    machine: '',
    executor: ''
  });
  const [machines, setMachines] = useState<string[]>([]);
  const [executors, setExecutors] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const hotTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTenantId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();
        
      setTenantId(data?.tenant_id || null);
    };
    
    fetchTenantId();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchOrders();
    }
  }, [filters, tenantId]);

  useEffect(() => {
    if (orders.length > 0) {
      const uniqueMachines = [...new Set(orders.map(order => 
        order.maintenance_tags?.machine?.name || 'N/A'
      ))];
      const uniqueExecutors = [...new Set(orders.map(order => order.executor))];
      
      setMachines(uniqueMachines);
      setExecutors(uniqueExecutors);
      generateTimelineColumns();
    } else {
      setLoading(false);
      setTimelineColumns([]);
      setHotData([]);
    }
  }, [orders]);

  useEffect(() => {
    if (orders.length > 0 && timelineColumns.length > 0) {
      prepareHotData();
    }
  }, [timelineColumns, orders]);

  const handleExportPDF = async () => {
    if (!hotTableRef.current) {
      setError('Nenhum dado para exportar');
      return;
    }

    try {
      setLoading(true);
      const input = hotTableRef.current;
      
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        logging: true,
        scrollY: -window.scrollY
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape');
      const imgWidth = 280; // A4 landscape width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`gantt-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Erro na exportação:', err);
      setError('Erro ao gerar PDF');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      if (!tenantId) return;
      
      setLoading(true);
      setError(null);

      if (filters.startDate && filters.endDate) {
        const start = parseISO(filters.startDate);
        const end = parseISO(filters.endDate);
        
        if (!isValid(start) || !isValid(end)) {
          throw new Error('Datas inválidas no filtro');
        }
        
        if (isAfter(start, end)) {
          throw new Error('Data inicial não pode ser maior que data final');
        }
      }

      let query = supabase
        .from('maintenance_orders')
        .select(`
          id,
          order_number,
          executor,
          status,
          description,
          execution_date,
          duration,
          maintenance_tags (
            tag_number,
            machine: equipment_hierarchy!maintenance_tags_machine_id_fkey (name),
            conjunto: equipment_hierarchy!maintenance_tags_conjunto_id_fkey (name)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('execution_date', { ascending: true });

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setHours(0, 0, 0, 0);
        query = query.gte('execution_date', startDate.toISOString());
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('execution_date', endDate.toISOString());
      }

      if (filters.machine) {
        query = query.ilike('maintenance_tags.machine.name', `%${filters.machine}%`);
      }

      if (filters.executor) {
        query = query.ilike('executor', `%${filters.executor}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      setOrders(data || []);
    } catch (error) {
      console.error('Error:', error);
      setError(`Erro ao carregar ordens: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateTimelineColumns = () => {
    try {
      let days: Date[] = [];

      if (filters.startDate && filters.endDate) {
        const startDate = parseISO(filters.startDate);
        const endDate = parseISO(filters.endDate);
        days = eachDayOfInterval({ start: startDate, end: endDate });
      } else {
        const validOrders = orders
          .filter(order => order.execution_date && isValid(parseISO(order.execution_date)))
          .map(order => parseISO(order.execution_date));

        if (validOrders.length === 0) {
          setTimelineColumns([]);
          return;
        }

        const minDate = new Date(Math.min(...validOrders.map(date => date.getTime())));
        const maxDate = new Date(Math.max(...validOrders.map(date => date.getTime())));
        days = eachDayOfInterval({ start: minDate, end: maxDate });
      }

      const columns = days.map(date => ({
        title: format(date, 'dd/MM'),
        data: format(date, 'yyyy-MM-dd'),
        type: 'customGantt',
        width: 100,
        readOnly: true
      }));
      
      setTimelineColumns(columns);
    } catch (error) {
      console.error('Error generating timeline:', error);
      setError('Erro ao gerar linha do tempo');
    }
  };

  const prepareHotData = () => {
    try {
      const data = orders.map(order => {
        const startDate = parseISO(order.execution_date);
        const endDate = addHours(startDate, order.duration);
        
        const rowData: any = {
          executor: order.executor,
          machine: order.maintenance_tags?.machine?.name || 'N/A',
          conjunto: order.maintenance_tags?.conjunto?.name || 'N/A',
          orderNumber: order.order_number,
          descricao: order.description || 'Sem descrição',
          status: order.status,
          start: format(startDate, 'dd/MM/yyyy HH:mm'),
          end: format(endDate, 'dd/MM/yyyy HH:mm')
        };
  
        timelineColumns.forEach(col => {
          const colDate = parseISO(col.data);
          rowData[col.data] = (
            isSameDay(colDate, startDate) ||
            isSameDay(colDate, endDate) ||
            (isAfter(colDate, startDate) && isBefore(colDate, endDate))
          );
        });
  
        return rowData;
      });
      
      setHotData(data);
    } catch (error) {
      console.error('Error preparing data:', error);
      setError('Erro ao formatar dados para exibição');
    }
  };

  const columns = [
    { title: 'Executor', data: 'executor', width: 150, readOnly: true },
    { title: 'Máquina', data: 'machine', width: 150, readOnly: true },
    { title: 'Conjunto', data: 'conjunto', width: 150, readOnly: true },
    { title: 'Ordem', data: 'orderNumber', width: 120, readOnly: true },
    { title: 'Descrição', data: 'descricao', width: 200, readOnly: true },
    ...timelineColumns
  ];

  const settings = {
    data: hotData,
    columns,
    colHeaders: true,
    rowHeaders: true,
    height: 'calc(100vh - 230px)',
    licenseKey: 'non-commercial-and-evaluation',
    afterGetColHeader: (col: number, TH: HTMLTableCellElement) => {
      if (col >= 5) {
        TH.style.backgroundColor = '#f8fafc';
        TH.style.fontWeight = '600';
        TH.style.textAlign = 'center';
      }
    },
    cells(row: number, col: number) {
      const cellProperties: any = {};
      if (col >= 5) cellProperties.type = 'customGantt';
      return cellProperties;
    },
    autoWrapRow: true,
    autoWrapCol: true
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600">Carregando informações da empresa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gráfico de Gantt</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Máquina</label>
            <select
              value={filters.machine}
              onChange={(e) => setFilters({...filters, machine: e.target.value})}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Todas</option>
              {machines.map((machine, index) => (
                <option key={index} value={machine}>{machine}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Executante</label>
            <select
              value={filters.executor}
              onChange={(e) => setFilters({...filters, executor: e.target.value})}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Todos</option>
              {executors.map((executor, index) => (
                <option key={index} value={executor}>{executor}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button 
            onClick={handleExportPDF}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            disabled={loading || hotData.length === 0}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Exportar PDF
          </button>
          
          <button 
            onClick={fetchOrders}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Atualizar Dados
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Carregando ordens...</p>
        </div>
      ) : hotData.length > 0 ? (
        <div ref={hotTableRef}>
          <HotTable
            settings={settings}
            className="handsontable-gantt rounded-lg overflow-hidden border border-gray-200"
          />
        </div>
      ) : (
        <div className="text-center py-8 space-y-4">
          <p className="text-gray-600">Nenhuma ordem programada encontrada</p>
          <div className="text-sm text-gray-500">
            <p>Verifique se:</p>
            <ul className="list-disc list-inside mt-2">
              <li>As ordens possuem data de execução válida</li>
              <li>A duração está definida corretamente</li>
              <li>As datas estão dentro do período visível</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceGantt;