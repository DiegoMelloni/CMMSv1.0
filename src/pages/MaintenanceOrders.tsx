import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Edit, Trash2, Download, RefreshCw, CheckCircle } from 'lucide-react';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import * as XLSX from 'xlsx';

const styles = StyleSheet.create({
  page: {
    padding: 30,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 15,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  value: {
    fontSize: 12,
    marginBottom: 8,
  },
  status: {
    fontSize: 10,
    color: '#fff',
    backgroundColor: '#4F46E5',
    padding: 3,
    borderRadius: 3,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    marginVertical: 15,
  },
});

interface Equipment {
  id: string;
  name: string;
  tenant_id: string;
}

interface MaintenanceTag {
  id: string;
  tag_number: string;
  requester: string;
  machine_id: string;
  conjunto_id: string;
  criticality: string;
  status: string;
  description: string;
  type: string;
  maintenance_type: string;
  created_at: string;
  tenant_id: string;
  preventive_id?: string | null;
  machine?: { name: string };
  conjunto?: { name: string };
  preventive?: { description: string };
}

interface MaintenanceOrder {
  id: string;
  order_number: string;
  tag_id: string;
  executor: string;
  description: string;
  execution_date: string;
  duration: number;
  status: string;
  confirmation_date?: string;
  execution_description?: string;
  tenant_id: string;
  machine_stopped: boolean;
  machine_running: boolean;
  maintenance_tags?: MaintenanceTag;
  order_materials?: Array<{
    material_name: string;
    quantity: number;
  }>;
}

interface OrderMaterial {
  material_name: string;
  quantity: string;
}

interface StockMaterial {
  id: number;
  material_name: string;
  quantity: number;
}

const OrdersPDF = ({ selectedOrders }: { selectedOrders: MaintenanceOrder[] }) => (
  <Document>
    {selectedOrders.map((order) => (
      <Page key={order.id} size="A4" style={styles.page}>
        <View style={styles.pageBreak}>
          <Text style={styles.title}>Ordem de Manutenção #{order.order_number}</Text>
          <Text style={styles.status}>Status: {order.status}</Text>
          <Text style={styles.text}>Duração: {order.duration} horas</Text>
          <Text style={styles.text}>Etiqueta: {order.maintenance_tags?.tag_number}</Text>
          <Text style={styles.text}>Máquina: {order.maintenance_tags?.machine?.name}</Text>
          <Text style={styles.text}>Conjunto: {order.maintenance_tags?.conjunto?.name}</Text>
          <Text style={styles.text}>Executante: {order.executor}</Text>
          <Text style={styles.text}>Data Programada: {new Date(order.execution_date).toLocaleDateString('pt-BR')}</Text>
          {order.confirmation_date && (
            <Text style={styles.text}>Data de Confirmação: {new Date(order.confirmation_date).toLocaleDateString('pt-BR')}</Text>
          )}
          <Text style={styles.text}>Descrição: {order.description}</Text>
          <Text style={styles.text}>Descrição da Execução: {order.execution_description}</Text>
          <Text style={styles.text}>Materiais: {order.order_materials?.map(m => `${m.material_name} (${m.quantity})`).join(', ')}</Text>
          <Text style={styles.text}>Máquina Parada: {order.machine_stopped ? 'Sim' : 'Não'}</Text>
          <Text style={styles.text}>Máquina Rodando: {order.machine_running ? 'Sim' : 'Não'}</Text>
        </View>
      </Page>
    ))}
  </Document>
);

// Função auxiliar para adicionar repetição a uma data base (não à data atual)
const addRepetition = (baseDate: string, repetition: string): string => {
  const date = new Date(baseDate);
  // Usar UTC para evitar deslocamento de fuso horário
  switch (repetition) {
    case 'Diaria':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'Semanal':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'Mensal':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'Bimestral':
      date.setUTCMonth(date.getUTCMonth() + 2);
      break;
    case 'Trimestral':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'Semestral':
      date.setUTCMonth(date.getUTCMonth() + 6);
      break;
    case 'Anual':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    default:
      break;
  }
  return date.toISOString();
};

export function MaintenanceOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [tags, setTags] = useState<MaintenanceTag[]>([]);
  const [materials, setMaterials] = useState<OrderMaterial[]>([]);
  const [executors, setExecutors] = useState<string[]>([]);
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    executor: '',
    orderNumber: '',
    status: ''
  });
  const [newOrder, setNewOrder] = useState({
    order_number: '',
    tag_id: '',
    executor: '',
    description: '',
    execution_date: '',
    duration: '',
    status: 'Programada' as 'Programada' | 'Confirmada',
    machine_stopped: false,
    machine_running: false,
    execution_description: ''
  });
  const [editingOrder, setEditingOrder] = useState<MaintenanceOrder | null>(null);
  const [newMaterial, setNewMaterial] = useState<OrderMaterial>({
    material_name: '',
    quantity: '',
  });
  const [confirmationData, setConfirmationData] = useState({
    orderId: null as string | null,
    execution_description: '',
    confirmation_date: new Date().toISOString().split('.')[0]
  });
  const [selectedTagDetails, setSelectedTagDetails] = useState({
    machine: '',
    conjunto: '',
    description: '',
    type: '',
    maintenance_type: ''
  });
  const [selectedOrders, setSelectedOrders] = useState<MaintenanceOrder[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [stockMaterials, setStockMaterials] = useState<StockMaterial[]>([]);

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
    const fetchMachines = async () => {
      if (!tenantId) return;
      const { data } = await supabase
        .from('equipment_hierarchy')
        .select('id, name, tenant_id')
        .eq('type', 'Maquina')
        .eq('tenant_id', tenantId)
        .order('name');
      setMachines(data || []);
    };
    const fetchStock = async () => {
      if (!tenantId) return;
      const { data } = await supabase
        .from('materials_stock')
        .select('id, material_name, quantity')
        .eq('tenant_id', tenantId)
        .order('material_name');
      setStockMaterials(data || []);
    };
    if (tenantId) {
      fetchMachines();
      fetchOrders();
      fetchTags();
      fetchStock();
    }
  }, [tenantId, filters, editingOrder, selectedMachine]);

  useEffect(() => {
    const uniqueExecutors = [...new Set(orders.map(order => order.executor))].filter(Boolean) as string[];
    setExecutors(uniqueExecutors);
  }, [orders]);

  useEffect(() => {
    if (newOrder.tag_id) {
      const selectedTag = tags.find(tag => tag.id === newOrder.tag_id);
      if (selectedTag) {
        setSelectedTagDetails({
          machine: selectedTag.machine?.name || 'Não informado',
          conjunto: selectedTag.conjunto?.name || 'Não informado',
          description: selectedTag.description || 'Sem descrição',
          type: selectedTag.type || 'Não informado',
          maintenance_type: selectedTag.maintenance_type || 'Não informado'
        });
      }
    } else {
      setSelectedTagDetails({
        machine: '',
        conjunto: '',
        description: '',
        type: '',
        maintenance_type: ''
      });
    }
  }, [newOrder.tag_id, tags]);

  const handleSelectOrder = (order: MaintenanceOrder) => {
    setSelectedOrders(prev => {
      if (prev.some(o => o.id === order.id)) {
        return prev.filter(o => o.id !== order.id);
      }
      return [...prev, order];
    });
  };

  const handleSelectAllOrders = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrders(orders);
    } else {
      setSelectedOrders([]);
    }
  };

  const exportToExcel = () => {
    if (selectedOrders.length === 0) {
      alert('Selecione pelo menos uma ordem para exportar para Excel!');
      return;
    }

    const filteredData = selectedOrders.map(order => ({
      'Número da Ordem': order.order_number,
      'Etiqueta': order.maintenance_tags?.tag_number || 'N/A',
      'Máquina': order.maintenance_tags?.machine?.name || 'N/A',
      'Conjunto': order.maintenance_tags?.conjunto?.name || 'N/A',
      'Status': order.status,
      'Executante': order.executor,
      'Duração (horas)': order.duration,
      'Data Programada': new Date(order.execution_date).toLocaleDateString('pt-BR'),
      'Data Confirmação': order.confirmation_date
        ? new Date(order.confirmation_date).toLocaleDateString('pt-BR')
        : 'N/A',
      'Descrição': order.description,
      'Descrição Execução': order.execution_description || 'N/A',
      'Materiais': order.order_materials?.map(m => `${m.material_name} (${m.quantity})`).join(', ') || 'N/A',
      'Máquina Parada': order.machine_stopped ? 'Sim' : 'Não',
      'Máquina Rodando': order.machine_running ? 'Sim' : 'Não'
    }));

    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ordens');
    XLSX.writeFile(workbook, `ordens-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePDFExport = (e: React.MouseEvent) => {
    if (selectedOrders.length === 0) {
      e.preventDefault();
      alert('Selecione pelo menos uma ordem para exportar para PDF!');
    }
  };

  const fetchOrders = async () => {
    try {
      if (!tenantId) return;
      let query = supabase
        .from('maintenance_orders')
        .select(`
          *,
          maintenance_tags (
            tag_number,
            status,
            type,
            maintenance_type,
            machine: equipment_hierarchy!maintenance_tags_machine_id_fkey (name),
            conjunto: equipment_hierarchy!maintenance_tags_conjunto_id_fkey (name),
            preventive_id
          ),
          order_materials (
            material_name,
            quantity
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (selectedMachine) {
        const { data: tags } = await supabase
          .from('maintenance_tags')
          .select('id')
          .eq('machine_id', selectedMachine)
          .eq('tenant_id', tenantId);
        const tagIds = tags?.map(tag => tag.id) || [];
        query = query.in('tag_id', tagIds);
      }

      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        const endDate = new Date(filters.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        query = query
          .gte('execution_date', startDate.toISOString())
          .lte('execution_date', endDate.toISOString());
      }

      if (filters.executor) {
        query = query
          .ilike('executor', `%${filters.executor}%`)
          .not('executor', 'is', null);
      }

      if (filters.orderNumber) {
        query = query.ilike('order_number', `%${filters.orderNumber}%`);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      const filteredData = data.filter(order =>
        order.order_number &&
        (!filters.orderNumber || order.order_number.toLowerCase().includes(filters.orderNumber.toLowerCase()))
      );
      setOrders(filteredData || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchTags = async () => {
    try {
      if (!tenantId) return;
      let query = supabase
        .from('maintenance_tags')
        .select(`
          *,
          machine: equipment_hierarchy!maintenance_tags_machine_id_fkey (name),
          conjunto: equipment_hierarchy!maintenance_tags_conjunto_id_fkey (name)
        `)
        .or(`status.eq.Pendente${editingOrder ? ',id.eq.' + editingOrder.tag_id : ''}`)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      setTags(data as MaintenanceTag[] || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!tenantId) return;
      const finalTagId = editingOrder && !newOrder.tag_id ? editingOrder.tag_id : newOrder.tag_id;
      if (!finalTagId) {
        alert('Selecione uma etiqueta!');
        return;
      }
      if (!newOrder.duration || isNaN(Number(newOrder.duration))) {
        alert('Duração inválida!');
        return;
      }
      if (!editingOrder) {
        const { data: existingOrder } = await supabase
          .from('maintenance_orders')
          .select('id')
          .eq('order_number', newOrder.order_number)
          .eq('tenant_id', tenantId)
          .single();
        if (existingOrder) {
          alert('Já existe uma ordem com este número nesta empresa!');
          return;
        }
      } else {
        if (editingOrder.order_number !== newOrder.order_number) {
          const { data: existingOrder } = await supabase
            .from('maintenance_orders')
            .select('id')
            .eq('order_number', newOrder.order_number)
            .eq('tenant_id', tenantId)
            .neq('id', editingOrder.id)
            .single();
          if (existingOrder) {
            alert('Já existe uma ordem com este número nesta empresa!');
            return;
          }
        }
      }
      const { data: tag } = await supabase
        .from('maintenance_tags')
        .select('machine_id, conjunto_id')
        .eq('id', finalTagId)
        .single();
      if (!tag) {
        alert('Etiqueta não encontrada!');
        return;
      }
      const { data: conjunto } = await supabase
        .from('equipment_hierarchy')
        .select('parent_id')
        .eq('id', tag.conjunto_id)
        .single();
      if (conjunto?.parent_id !== tag.machine_id) {
        alert('Conjunto não pertence à máquina selecionada!');
        return;
      }
      const orderData = {
        ...newOrder,
        tag_id: finalTagId,
        duration: parseFloat(newOrder.duration),
        tenant_id: tenantId,
        machine_stopped: newOrder.machine_stopped,
        machine_running: newOrder.machine_running,
        execution_description: newOrder.execution_description
      };
      if (editingOrder) {
        const { data: order, error: orderError } = await supabase
          .from('maintenance_orders')
          .update(orderData)
          .eq('id', editingOrder.id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (orderError) throw orderError;
        await supabase
          .from('order_materials')
          .delete()
          .eq('order_id', editingOrder.id)
          .eq('tenant_id', tenantId);
        if (materials.length > 0) {
          const materialsWithOrderId = materials.map((material) => ({
            ...material,
            order_id: editingOrder.id,
            quantity: Number(material.quantity),
            tenant_id: tenantId
          }));
          await supabase
            .from('order_materials')
            .insert(materialsWithOrderId);
        }
        if (editingOrder.tag_id !== finalTagId) {
          const { data: oldTagOrders } = await supabase
            .from('maintenance_orders')
            .select('id')
            .eq('tag_id', editingOrder.tag_id)
            .eq('tenant_id', tenantId);
          if (oldTagOrders?.length === 0) {
            await supabase
              .from('maintenance_tags')
              .update({ status: 'Pendente' })
              .eq('id', editingOrder.tag_id)
              .eq('tenant_id', tenantId);
          }
          await supabase
            .from('maintenance_tags')
            .update({ status: 'Programada' })
            .eq('id', finalTagId)
            .eq('tenant_id', tenantId);
        }
        alert('Ordem atualizada com sucesso!');
      } else {
        const { data: order, error: orderError } = await supabase
          .from('maintenance_orders')
          .insert([orderData])
          .select()
          .single();
        if (orderError) throw orderError;
        await supabase
          .from('maintenance_tags')
          .update({ status: 'Programada' })
          .eq('id', finalTagId)
          .eq('tenant_id', tenantId);
        if (materials.length > 0) {
          const materialsWithOrderId = materials.map((material) => ({
            ...material,
            order_id: order.id,
            quantity: Number(material.quantity),
            tenant_id: tenantId
          }));
          await supabase
            .from('order_materials')
            .insert(materialsWithOrderId);
        }
        alert('Ordem criada com sucesso!');
      }
      setNewOrder({
        order_number: '',
        tag_id: '',
        executor: '',
        description: '',
        execution_date: '',
        duration: '',
        status: 'Programada',
        machine_stopped: false,
        machine_running: false,
        execution_description: ''
      });
      setMaterials([]);
      setEditingOrder(null);
      fetchOrders();
      fetchTags();
    } catch (error: any) {
      if (error.code === '23505') {
        alert('Número de ordem já existe nesta empresa!');
      } else {
        console.error('Error saving order:', error);
        alert('Erro ao salvar ordem: ' + error.message);
      }
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterial.material_name || !newMaterial.quantity) {
      alert('Preencha todos os campos do material!');
      return;
    }
    const stockItem = stockMaterials.find(s => s.material_name === newMaterial.material_name);
    if (!stockItem) {
      alert(`O material "${newMaterial.material_name}" não existe no estoque. Cadastre-o primeiro no estoque de materiais.`);
      return;
    }
    if (materials.length >= 10) {
      alert('Máximo de 10 materiais por ordem!');
      return;
    }
    setMaterials([...materials, {
      material_name: newMaterial.material_name,
      quantity: newMaterial.quantity
    }]);
    setNewMaterial({ material_name: '', quantity: '' });
  };

  const handleRemoveMaterial = (index: number) => {
    const newMaterials = [...materials];
    newMaterials.splice(index, 1);
    setMaterials(newMaterials);
  };

  const handleDeleteOrder = async (order: MaintenanceOrder) => {
    if (window.confirm(`Tem certeza que deseja excluir a ordem ${order.order_number}?`)) {
      try {
        if (!tenantId) return;
        await supabase
          .from('order_materials')
          .delete()
          .eq('order_id', order.id)
          .eq('tenant_id', tenantId);
        const { error } = await supabase
          .from('maintenance_orders')
          .delete()
          .eq('id', order.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
        if (order.status === 'Programada') {
          const { data: ordersForTag } = await supabase
            .from('maintenance_orders')
            .select('id')
            .eq('tag_id', order.tag_id)
            .eq('tenant_id', tenantId);
          if (ordersForTag?.length === 0) {
            await supabase
              .from('maintenance_tags')
              .update({ status: 'Pendente' })
              .eq('id', order.tag_id)
              .eq('tenant_id', tenantId);
          }
        }
        alert('Ordem excluída com sucesso!');
        fetchOrders();
        fetchTags();
      } catch (error: any) {
        console.error('Error deleting order:', error);
        alert('Erro ao excluir ordem: ' + error.message);
      }
    }
  };

  const handleEditOrder = (order: MaintenanceOrder) => {
    setEditingOrder(order);
    setNewOrder({
      order_number: order.order_number,
      tag_id: order.tag_id,
      executor: order.executor,
      description: order.description,
      execution_date: order.execution_date,
      duration: order.duration.toString(),
      status: order.status,
      machine_stopped: order.machine_stopped,
      machine_running: order.machine_running,
      execution_description: order.execution_description || ''
    });
    setMaterials(order.order_materials?.map(m => ({
      material_name: m.material_name,
      quantity: m.quantity.toString()
    })) || []);
    document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingOrder(null);
    setNewOrder({
      order_number: '',
      tag_id: '',
      executor: '',
      description: '',
      execution_date: '',
      duration: '',
      status: 'Programada',
      machine_stopped: false,
      machine_running: false,
      execution_description: ''
    });
    setMaterials([]);
  };

  const confirmOrder = async () => {
    try {
      if (!tenantId) return;
      if (!confirmationData.execution_description) {
        alert('Preencha a descrição da execução!');
        return;
      }
      const order = orders.find(o => o.id === confirmationData.orderId);
      if (!order) throw new Error('Ordem não encontrada');
      if (order.status === 'Confirmada') {
        alert('Esta ordem já foi confirmada!');
        setConfirmationData({
          orderId: null,
          execution_description: '',
          confirmation_date: new Date().toISOString().split('.')[0]
        });
        return;
      }

      // 1. Atualizar ordem
      const { error: orderError } = await supabase
        .from('maintenance_orders')
        .update({
          status: 'Confirmada',
          execution_description: confirmationData.execution_description,
          confirmation_date: confirmationData.confirmation_date
        })
        .eq('id', confirmationData.orderId)
        .eq('tenant_id', tenantId);
      if (orderError) throw orderError;

      // 2. Atualizar tag
      const { error: tagError } = await supabase
        .from('maintenance_tags')
        .update({ status: 'Confirmada' })
        .eq('id', order.tag_id)
        .eq('tenant_id', tenantId);
      if (tagError) throw tagError;

      // 3. Buscar tag completa para obter preventive_id
      const { data: tagData, error: tagFetchError } = await supabase
        .from('maintenance_tags')
        .select('preventive_id')
        .eq('id', order.tag_id)
        .maybeSingle();
      if (tagFetchError) throw tagFetchError;

      console.log('Tag data:', tagData);

      if (tagData?.preventive_id) {
        // Buscar a preventiva
        const { data: preventive, error: prevError } = await supabase
          .from('preventive_maintenances')
          .select('repetition, next_execution')
          .eq('id', tagData.preventive_id)
          .maybeSingle();
        if (prevError) throw prevError;

        console.log('Preventiva encontrada:', preventive);

        if (preventive) {
          const nextDate = addRepetition(preventive.next_execution, preventive.repetition);
          const now = new Date().toISOString();
          console.log('Atualizando preventiva:', {
            old_next: preventive.next_execution,
            new_next: nextDate
          });
          const { error: updateError } = await supabase
            .from('preventive_maintenances')
            .update({
              next_execution: nextDate,
              last_triggered: now,
              current_status: 'Pendente'
            })
            .eq('id', tagData.preventive_id);
          if (updateError) throw updateError;
          console.log('Preventiva atualizada com sucesso!');
        } else {
          console.warn('Preventiva não encontrada para o ID:', tagData.preventive_id);
        }
      } else {
        console.log('Tag não possui preventive_id');
      }

      setConfirmationData({
        orderId: null,
        execution_description: '',
        confirmation_date: new Date().toISOString().split('.')[0]
      });
      await fetchOrders();
      await fetchTags();
      alert('Ordem confirmada e preventiva atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro detalhado ao confirmar:', error);
      alert('Erro ao confirmar ordem: ' + error.message);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      executor: '',
      orderNumber: '',
      status: ''
    });
    setSelectedMachine('');
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
    <div className="space-y-6 p-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Ordens de Manutenção</h1>

        <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos</option>
                <option value="Programada">Programada</option>
                <option value="Confirmada">Confirmada</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Data Inicial</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Data Final</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Executante</label>
              <input
                type="text"
                placeholder="Filtrar executante"
                value={filters.executor}
                onChange={(e) => setFilters({ ...filters, executor: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Número</label>
              <input
                type="text"
                placeholder="Buscar por número"
                value={filters.orderNumber}
                onChange={(e) => setFilters({ ...filters, orderNumber: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Máquina</label>
              <select
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todas</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>{machine.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
            >
              <RefreshCw size={18} />
              Atualizar
            </button>

            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 flex items-center gap-2"
            >
              Limpar Filtros
            </button>

            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <Download size={18} />
              Exportar Excel
            </button>

            <div onClick={handlePDFExport}>
              <PDFDownloadLink
                document={<OrdersPDF selectedOrders={selectedOrders} />}
                fileName="ordens-selecionadas.pdf"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                disabled={selectedOrders.length === 0}
              >
                {({ loading }) => loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw size={18} className="animate-spin" />
                    Gerando PDF...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download size={18} />
                    Exportar PDF
                  </span>
                )}
              </PDFDownloadLink>
            </div>
          </div>
        </div>

        <form id="order-form" onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingOrder ? `Editando Ordem #${editingOrder.order_number}` : 'Nova Ordem de Manutenção'}
            </h2>
            {editingOrder && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm text-gray-500 hover:text-gray-700 mt-2"
              >
                Cancelar Edição
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Número da Ordem</label>
              <input
                type="text"
                required
                value={newOrder.order_number}
                onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Etiqueta</label>
              <select
                value={newOrder.tag_id}
                onChange={(e) => setNewOrder({ ...newOrder, tag_id: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={!!editingOrder}
              >
                <option value="">Selecione uma etiqueta</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.tag_number} ({tag.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Executante</label>
              <input
                type="text"
                list="executors-list"
                required
                value={newOrder.executor}
                onChange={(e) => setNewOrder({ ...newOrder, executor: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Digite ou selecione um executante"
              />
              <datalist id="executors-list">
                {executors.map((executor, index) => (
                  <option key={index} value={executor} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Duração (horas)</label>
              <input
                type="number"
                required
                min="1"
                step="0.5"
                value={newOrder.duration}
                onChange={(e) => setNewOrder({ ...newOrder, duration: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ex: 2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Data Programada</label>
              <input
                type="datetime-local"
                required
                value={newOrder.execution_date}
                onChange={(e) => setNewOrder({ ...newOrder, execution_date: e.target.value })}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Condição da Máquina</label>
              <div className="flex gap-4 mt-2">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={newOrder.machine_stopped}
                    onChange={(e) => setNewOrder({
                      ...newOrder,
                      machine_stopped: e.target.checked,
                      machine_running: e.target.checked ? false : newOrder.machine_running
                    })}
                    className="form-checkbox h-4 w-4 text-indigo-600"
                  />
                  <span className="ml-2 text-sm text-gray-700">Máquina Parada</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={newOrder.machine_running}
                    onChange={(e) => setNewOrder({
                      ...newOrder,
                      machine_running: e.target.checked,
                      machine_stopped: e.target.checked ? false : newOrder.machine_stopped
                    })}
                    className="form-checkbox h-4 w-4 text-indigo-600"
                  />
                  <span className="ml-2 text-sm text-gray-700">Máquina Rodando</span>
                </label>
              </div>
            </div>
          </div>

          {newOrder.tag_id && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Detalhes da Etiqueta:</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Máquina:</span> {selectedTagDetails.machine}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Conjunto:</span> {selectedTagDetails.conjunto}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Tipo:</span> {selectedTagDetails.type}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Manutenção:</span> {selectedTagDetails.maintenance_type}
                  </p>
                </div>
                <div className="md:col-span-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Descrição:</span> {selectedTagDetails.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Descrição</label>
            <textarea
              required
              value={newOrder.description}
              onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
              rows={3}
              className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {newOrder.status === 'Confirmada' && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Descrição da Execução</label>
              <textarea
                value={newOrder.execution_description}
                onChange={(e) => setNewOrder({ ...newOrder, execution_description: e.target.value })}
                rows={3}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Materiais Utilizados</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <input
                  type="text"
                  list="stock-materials"
                  placeholder="Nome do material (selecione ou digite)"
                  value={newMaterial.material_name}
                  onChange={(e) => setNewMaterial({ ...newMaterial, material_name: e.target.value })}
                  className="p-2 border rounded-md w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <datalist id="stock-materials">
                  {stockMaterials.map((mat) => (
                    <option key={mat.id} value={mat.material_name}>
                      {mat.material_name} (estoque: {mat.quantity})
                    </option>
                  ))}
                </datalist>
              </div>
              <input
                type="number"
                placeholder="Quantidade"
                min="1"
                value={newMaterial.quantity}
                onChange={(e) => setNewMaterial({ ...newMaterial, quantity: e.target.value })}
                className="p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddMaterial}
                className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Adicionar Material
              </button>
            </div>

            {materials.length > 0 && (
              <div className="mt-4 space-y-2">
                {materials.map((material, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center bg-gray-50 p-3 rounded-md"
                  >
                    <span className="text-sm">{material.material_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{material.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full p-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {editingOrder ? 'Atualizar Ordem' : 'Criar Ordem'}
          </button>
        </form>

        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onChange={handleSelectAllOrders}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etiqueta</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Máquina</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conjunto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duração</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Executante</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Programação</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confirmação</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedOrders.some(o => o.id === order.id)}
                      onChange={() => handleSelectOrder(order)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      order.status === 'Programada'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">
                    {order.order_number}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.maintenance_tags?.tag_number || 'N/A'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.maintenance_tags?.machine?.name || 'N/A'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.maintenance_tags?.conjunto?.name || 'N/A'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.duration} horas
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.executor}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {new Date(order.execution_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {order.confirmation_date
                      ? new Date(order.confirmation_date).toLocaleDateString('pt-BR')
                      : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      {order.status === 'Programada' && (
                        <button
                          onClick={() => setConfirmationData({
                            ...confirmationData,
                            orderId: order.id
                          })}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Confirmar"
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditOrder(order)}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order)}
                        className="text-red-600 hover:text-red-900"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {confirmationData.orderId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg w-96 space-y-4">
              <h3 className="text-lg font-bold">Confirmar Ordem</h3>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Data de Confirmação</label>
                <input
                  type="datetime-local"
                  value={confirmationData.confirmation_date}
                  onChange={(e) => setConfirmationData({
                    ...confirmationData,
                    confirmation_date: e.target.value
                  })}
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Descrição da Execução</label>
                <textarea
                  value={confirmationData.execution_description}
                  onChange={(e) => setConfirmationData({
                    ...confirmationData,
                    execution_description: e.target.value
                  })}
                  className="w-full p-2 border rounded-md"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmationData({
                    orderId: null,
                    execution_description: '',
                    confirmation_date: new Date().toISOString().split('.')[0]
                  })}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmOrder}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}