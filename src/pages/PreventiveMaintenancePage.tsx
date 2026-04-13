import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}

interface PreventiveMaintenance {
  id: string;
  description: string;
  machine_id: string;
  conjunto_id: string;
  equipment_id?: string | null;
  materials: Array<{ name: string; quantity: number }>;
  start_date: string;
  repetition: string;
  maintenance_type: string;
  criticality: string;
  next_execution: string;
  last_triggered?: string;
  status?: string;
  tenant_id: string;
  machine?: { name: string };
  conjunto?: { name: string };
  equipment?: { name: string };
  tags?: Array<{ status: string; created_at: string }>;
  open_tag?: { id: string; status: string; created_at: string } | null;
}

const Badge = ({ variant = 'default', children }: BadgeProps) => {
  const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
  const variantClasses = {
    default: "bg-gray-100 text-gray-800",
    success: "bg-green-100 text-green-800",
    info: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    danger: "bg-red-100 text-red-800",
  };
  return <span className={`${baseClasses} ${variantClasses[variant]}`}>{children}</span>;
};

const MAINTENANCE_TYPES = ['Mecânica', 'Elétrica'];
const REPETITION_OPTIONS = [
  { value: 'Diaria', label: 'Diária' },
  { value: 'Semanal', label: 'Semanal' },
  { value: 'Mensal', label: 'Mensal' },
  { value: 'Bimestral', label: 'Bimestral' },
  { value: 'Trimestral', label: 'Trimestral' },
  { value: 'Semestral', label: 'Semestral' },
  { value: 'Anual', label: 'Anual' }
];
const CRITICALITY_OPTIONS = ['A', 'B', 'C'];

const PreventiveMaintenancePage = () => {
  const [preventives, setPreventives] = useState<PreventiveMaintenance[]>([]);
  const [machines, setMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [availableConjuntos, setAvailableConjuntos] = useState<Array<{ id: string; name: string }>>([]);
  const [availableEquipments, setAvailableEquipments] = useState<Array<{ id: string; name: string }>>([]);

  const [newPreventive, setNewPreventive] = useState({
    description: '',
    machine_id: '',
    conjunto_id: '',
    equipment_id: '' as string | null,
    materials: [{ name: '', quantity: 1 }],
    start_date: '',
    repetition: 'Mensal',
    maintenance_type: 'Mecânica',
    criticality: 'A'
  });

  const [selectedMachineName, setSelectedMachineName] = useState('');
  const [selectedConjuntoName, setSelectedConjuntoName] = useState('');

  const [editingPreventive, setEditingPreventive] = useState<PreventiveMaintenance | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', orderNumber: '', maintenanceType: '' });

  const [editAvailableConjuntos, setEditAvailableConjuntos] = useState<Array<{ id: string; name: string }>>([]);
  const [editAvailableEquipments, setEditAvailableEquipments] = useState<Array<{ id: string; name: string }>>([]);
  const [editMachineName, setEditMachineName] = useState('');
  const [editConjuntoName, setEditConjuntoName] = useState('');

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
      fetchPreventives();
      fetchEquipmentData();
      const channel = setupRealtimeUpdates();
      const intervalId = startScheduleChecker();
      return () => {
        channel.unsubscribe();
        clearInterval(intervalId);
      };
    }
  }, [tenantId]);

  const setupRealtimeUpdates = () => {
    const channel = supabase
      .channel('preventive-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'maintenance_tags',
        filter: `tenant_id=eq.${tenantId}`
      }, () => fetchPreventives())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'preventive_maintenances',
        filter: `tenant_id=eq.${tenantId}`
      }, () => fetchPreventives())
      .subscribe();
    return channel;
  };

  const startScheduleChecker = () => {
    const intervalId = setInterval(() => {
      checkPreventiveSchedules();
    }, 3600000);
    checkPreventiveSchedules();
    return intervalId;
  };

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

  const getEquipmentHierarchy = async (equipmentId: string) => {
    let machineId = null;
    let conjuntoId = null;
    let machineName = '';
    let conjuntoName = '';
    const fetchParent = async (id: string) => {
      const { data } = await supabase
        .from('equipment_hierarchy')
        .select('id, type, parent_id, name')
        .eq('id', id)
        .single();
      if (!data) return;
      if (data.type === 'Conjunto') {
        conjuntoId = data.id;
        conjuntoName = data.name;
      }
      if (data.type === 'Maquina') {
        machineId = data.id;
        machineName = data.name;
      }
      if (data.parent_id && (!machineId || !conjuntoId)) {
        await fetchParent(data.parent_id);
      }
    };
    await fetchParent(equipmentId);
    return { machine_id: machineId, conjunto_id: conjuntoId, machineName, conjuntoName };
  };

  const hasOpenTag = async (preventiveId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('maintenance_tags')
      .select('id')
      .eq('preventive_id', preventiveId)
      .in('status', ['Pendente', 'Programada'])
      .maybeSingle();
    return !!data;
  };

  const checkPreventiveSchedules = async () => {
    if (!tenantId) return;
    try {
      const now = new Date();
      // Margem de 1 minuto para evitar criar tag imediatamente após confirmação
      const dueDate = new Date(now.getTime() - 60000); // 1 minuto atrás
      const { data: duePreventives, error } = await supabase
        .from('preventive_maintenances')
        .select('*')
        .lte('next_execution', dueDate.toISOString())
        .eq('tenant_id', tenantId);
      if (error) throw error;

      for (const preventive of duePreventives) {
        // Evitar criar tag se a última execução foi há menos de 5 minutos
        if (preventive.last_triggered) {
          const lastTriggered = new Date(preventive.last_triggered);
          const diffMinutes = (now.getTime() - lastTriggered.getTime()) / 60000;
          if (diffMinutes < 5) {
            console.log(`Preventiva ${preventive.id} foi executada há ${diffMinutes.toFixed(1)} min. Pulando.`);
            continue;
          }
        }

        const alreadyOpen = await hasOpenTag(preventive.id);
        if (alreadyOpen) continue;

        let machineId = preventive.machine_id;
        let conjuntoId = preventive.conjunto_id;

        if (preventive.equipment_id) {
          const { machine_id, conjunto_id } = await getEquipmentHierarchy(preventive.equipment_id);
          if (machine_id) machineId = machine_id;
          if (conjunto_id) conjuntoId = conjunto_id;
        }

        if (!machineId || !conjuntoId) {
          console.error(`Preventiva ${preventive.id} sem máquina/conjunto válido`);
          continue;
        }

        let description = `Manutenção Preventiva: ${preventive.description}`;
        const materials = preventive.materials
          ? (Array.isArray(preventive.materials) ? preventive.materials : JSON.parse(preventive.materials))
          : [];
        if (materials.length > 0) {
          const materialsText = materials
            .filter((m: any) => m.name && m.quantity > 0)
            .map((m: any) => `${m.name} (${m.quantity})`)
            .join(', ');
          description += `\nMateriais necessários: ${materialsText}`;
        }

        const { error: tagError } = await supabase
          .from('maintenance_tags')
          .insert({
            tag_number: `PREV-${Date.now()}`,
            requester: 'Sistema Automático',
            description: description,
            type: 'Preventiva',
            status: 'Pendente',
            machine_id: machineId,
            conjunto_id: conjuntoId,
            criticality: preventive.criticality,
            maintenance_type: preventive.maintenance_type,
            tenant_id: tenantId,
            preventive_id: preventive.id
          });
        if (tagError) throw tagError;

        await supabase
          .from('preventive_maintenances')
          .update({ current_status: 'Em Aberto' })
          .eq('id', preventive.id);
      }
    } catch (error) {
      console.error('Erro no processo automático:', error);
    }
  };

  const fetchPreventives = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('preventive_maintenances')
        .select(`
          *,
          machine: equipment_hierarchy!machine_id(name),
          conjunto: equipment_hierarchy!conjunto_id(name),
          equipment: equipment_hierarchy!equipment_id(name),
          tags: maintenance_tags!preventive_id(status, created_at)
        `)
        .eq('tenant_id', tenantId)
        .order('next_execution', { ascending: true });
      if (error) throw error;

      const enhancedData = data.map(preventive => {
        const openTag = preventive.tags?.find(t => t.status === 'Pendente' || t.status === 'Programada');
        const now = new Date();
        const nextExec = new Date(preventive.next_execution);
        let status = '';
        if (openTag) status = 'Em Aberto';
        else if (nextExec < now) status = 'Atrasada';
        else status = 'Pendente';
        return {
          ...preventive,
          status,
          open_tag: openTag || null,
          materials: Array.isArray(preventive.materials)
            ? preventive.materials
            : JSON.parse(preventive.materials || '[]')
        };
      });
      setPreventives(enhancedData);
    } catch (error) {
      console.error('Erro ao buscar preventivas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipmentData = async () => {
    try {
      const { data: machinesData } = await supabase
        .from('equipment_hierarchy')
        .select('id, name')
        .eq('type', 'Maquina')
        .eq('tenant_id', tenantId)
        .order('name');
      setMachines(machinesData || []);
    } catch (error) {
      console.error('Erro ao buscar equipamentos:', error);
    }
  };

  const loadConjuntosByMachine = async (machineId: string) => {
    if (!machineId) {
      setAvailableConjuntos([]);
      return;
    }
    const { data } = await supabase
      .from('equipment_hierarchy')
      .select('id, name')
      .eq('type', 'Conjunto')
      .eq('parent_id', machineId)
      .eq('tenant_id', tenantId)
      .order('name');
    setAvailableConjuntos(data || []);
  };

  const loadEquipmentsByConjunto = async (conjuntoId: string) => {
    if (!conjuntoId) {
      setAvailableEquipments([]);
      return;
    }
    const { data } = await supabase
      .from('equipment_hierarchy')
      .select('id, name')
      .eq('type', 'Equipamento')
      .eq('parent_id', conjuntoId)
      .eq('tenant_id', tenantId)
      .order('name');
    setAvailableEquipments(data || []);
  };

  const handleMachineChange = async (machineId: string) => {
    setNewPreventive(prev => ({ ...prev, machine_id: machineId, conjunto_id: '', equipment_id: '' }));
    setSelectedMachineName('');
    setSelectedConjuntoName('');
    await loadConjuntosByMachine(machineId);
    setAvailableEquipments([]);
  };

  const handleConjuntoChange = async (conjuntoId: string) => {
    setNewPreventive(prev => ({ ...prev, conjunto_id: conjuntoId, equipment_id: '' }));
    setSelectedMachineName('');
    setSelectedConjuntoName('');
    await loadEquipmentsByConjunto(conjuntoId);
  };

  const handleEquipmentChange = async (equipmentId: string | null) => {
    if (!equipmentId) {
      setNewPreventive(prev => ({ ...prev, equipment_id: null }));
      setSelectedMachineName('');
      setSelectedConjuntoName('');
      return;
    }
    const { machine_id, conjunto_id, machineName, conjuntoName } = await getEquipmentHierarchy(equipmentId);
    setNewPreventive(prev => ({
      ...prev,
      equipment_id: equipmentId,
      machine_id: machine_id || '',
      conjunto_id: conjunto_id || ''
    }));
    setSelectedMachineName(machineName);
    setSelectedConjuntoName(conjuntoName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!tenantId) {
        alert('Empresa não identificada');
        return;
      }

      if (!newPreventive.machine_id) {
        alert('Selecione uma máquina!');
        return;
      }
      if (!newPreventive.equipment_id && !newPreventive.conjunto_id) {
        alert('Selecione um conjunto ou um equipamento!');
        return;
      }
      if (!newPreventive.start_date) {
        alert('Informe a data inicial!');
        return;
      }

      const nextExecution = addRepetition(newPreventive.start_date, newPreventive.repetition);
      const insertData: any = {
        description: newPreventive.description,
        start_date: newPreventive.start_date,
        repetition: newPreventive.repetition,
        maintenance_type: newPreventive.maintenance_type,
        criticality: newPreventive.criticality,
        tenant_id: tenantId,
        next_execution: nextExecution,
        materials: JSON.stringify(newPreventive.materials.filter(m => m.name && m.quantity > 0)),
        current_status: 'Pendente',
        machine_id: newPreventive.machine_id,
        conjunto_id: newPreventive.conjunto_id,
        equipment_id: newPreventive.equipment_id || null
      };

      const { error } = await supabase.from('preventive_maintenances').insert([insertData]);
      if (error) throw error;

      resetForm();
      (document.getElementById('preventive_modal') as HTMLDialogElement)?.close();
      await fetchPreventives();
      alert('Preventiva criada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao criar preventiva:', error);
      alert('Erro ao criar preventiva: ' + error.message);
    }
  };

  const handleUpdatePreventive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editingPreventive || !tenantId) return;

      if (!editingPreventive.machine_id) {
        alert('Selecione uma máquina!');
        return;
      }
      if (!editingPreventive.equipment_id && !editingPreventive.conjunto_id) {
        alert('Selecione um conjunto ou um equipamento!');
        return;
      }

      const nextExecution = addRepetition(editingPreventive.start_date, editingPreventive.repetition);
      const updateData: any = {
        description: editingPreventive.description,
        start_date: editingPreventive.start_date,
        repetition: editingPreventive.repetition,
        maintenance_type: editingPreventive.maintenance_type,
        criticality: editingPreventive.criticality,
        next_execution: nextExecution,
        materials: JSON.stringify(editingPreventive.materials.filter(m => m.name && m.quantity > 0)),
        machine_id: editingPreventive.machine_id,
        conjunto_id: editingPreventive.conjunto_id,
        equipment_id: editingPreventive.equipment_id || null
      };

      const { error } = await supabase
        .from('preventive_maintenances')
        .update(updateData)
        .eq('id', editingPreventive.id)
        .eq('tenant_id', tenantId);
      if (error) throw error;

      setEditingPreventive(null);
      (document.getElementById('edit_preventive_modal') as HTMLDialogElement)?.close();
      await fetchPreventives();
      alert('Preventiva atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao atualizar preventiva:', error);
      alert('Erro ao atualizar preventiva: ' + error.message);
    }
  };

  const deletePreventive = async (id: string) => {
    if (!tenantId || !window.confirm('Tem certeza que deseja excluir esta manutenção preventiva?')) return;
    try {
      const { error } = await supabase.from('preventive_maintenances').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      await fetchPreventives();
      alert('Preventiva excluída com sucesso!');
    } catch (error: any) {
      console.error('Erro ao excluir preventiva:', error);
      alert('Erro ao excluir preventiva: ' + error.message);
    }
  };

  const startEditing = async (preventive: PreventiveMaintenance) => {
    setEditingPreventive({
      ...preventive,
      materials: Array.isArray(preventive.materials) ? preventive.materials : JSON.parse(preventive.materials || '[]')
    });
    if (preventive.machine_id) {
      const { data: conj } = await supabase
        .from('equipment_hierarchy')
        .select('id, name')
        .eq('type', 'Conjunto')
        .eq('parent_id', preventive.machine_id)
        .eq('tenant_id', tenantId)
        .order('name');
      setEditAvailableConjuntos(conj || []);
    }
    if (preventive.conjunto_id) {
      const { data: eqs } = await supabase
        .from('equipment_hierarchy')
        .select('id, name')
        .eq('type', 'Equipamento')
        .eq('parent_id', preventive.conjunto_id)
        .eq('tenant_id', tenantId)
        .order('name');
      setEditAvailableEquipments(eqs || []);
    }
    if (preventive.equipment_id) {
      const { machineName, conjuntoName } = await getEquipmentHierarchy(preventive.equipment_id);
      setEditMachineName(machineName);
      setEditConjuntoName(conjuntoName);
    } else {
      setEditMachineName('');
      setEditConjuntoName('');
    }
    (document.getElementById('edit_preventive_modal') as HTMLDialogElement)?.showModal();
  };

  const resetForm = () => {
    setNewPreventive({
      description: '',
      machine_id: '',
      conjunto_id: '',
      equipment_id: '',
      materials: [{ name: '', quantity: 1 }],
      start_date: '',
      repetition: 'Mensal',
      maintenance_type: 'Mecânica',
      criticality: 'A'
    });
    setSelectedMachineName('');
    setSelectedConjuntoName('');
    setAvailableConjuntos([]);
    setAvailableEquipments([]);
  };

  const handleResetFilters = () => {
    setFilters({ status: '', orderNumber: '', maintenanceType: '' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmada': return <Badge variant="success">Confirmada - Aguardando Próxima</Badge>;
      case 'Em Aberto': return <Badge variant="info">Em Aberto (tag pendente)</Badge>;
      case 'Atrasada': return <Badge variant="danger">Atrasada - Execução Pendente</Badge>;
      default: return <Badge variant="warning">Pendente (aguardando data)</Badge>;
    }
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
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Manutenções Preventivas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            <Filter size={18} />
            Filtros
          </button>
          <button
            onClick={() => (document.getElementById('preventive_modal') as HTMLDialogElement)?.showModal()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus size={18} />
            Nova Preventiva
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Tipo de Manutenção</label>
              <select
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                value={filters.maintenanceType}
                onChange={(e) => setFilters({ ...filters, maintenanceType: e.target.value })}
              >
                <option value="">Todos os tipos</option>
                {MAINTENANCE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 flex items-center gap-2"
              >
                <X size={16} />
                Limpar
              </button>
              <button
                onClick={fetchPreventives}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex-1"
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação */}
      <dialog id="preventive_modal" className="modal">
        <div className="modal-box max-w-3xl bg-white rounded-lg shadow-xl">
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Cadastrar Nova Preventiva</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Descrição</label>
                  <textarea
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    value={newPreventive.description}
                    onChange={(e) => setNewPreventive({ ...newPreventive, description: e.target.value })}
                    required rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Máquina *</label>
                  {newPreventive.equipment_id ? (
                    <input
                      type="text"
                      value={selectedMachineName}
                      disabled
                      className="w-full p-2 border rounded-lg bg-gray-100"
                    />
                  ) : (
                    <select
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      value={newPreventive.machine_id}
                      onChange={(e) => handleMachineChange(e.target.value)}
                      required
                    >
                      <option value="">Selecione uma máquina</option>
                      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Conjunto</label>
                  {newPreventive.equipment_id ? (
                    <input
                      type="text"
                      value={selectedConjuntoName}
                      disabled
                      className="w-full p-2 border rounded-lg bg-gray-100"
                    />
                  ) : (
                    <select
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      value={newPreventive.conjunto_id}
                      onChange={(e) => handleConjuntoChange(e.target.value)}
                      disabled={!newPreventive.machine_id}
                    >
                      <option value="">Selecione um conjunto</option>
                      {availableConjuntos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Equipamento</label>
                  <select
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    value={newPreventive.equipment_id || ''}
                    onChange={(e) => handleEquipmentChange(e.target.value || null)}
                    disabled={!newPreventive.conjunto_id}
                  >
                    <option value="">Nenhum</option>
                    {availableEquipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-500">O equipamento só pode ser selecionado após escolher máquina e conjunto.</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Tipo de Manutenção</label>
                  <select
                    className="w-full p-2 border rounded-lg"
                    value={newPreventive.maintenance_type}
                    onChange={(e) => setNewPreventive({ ...newPreventive, maintenance_type: e.target.value })}
                    required
                  >
                    {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Criticidade</label>
                  <select
                    className="w-full p-2 border rounded-lg"
                    value={newPreventive.criticality}
                    onChange={(e) => setNewPreventive({ ...newPreventive, criticality: e.target.value })}
                    required
                  >
                    {CRITICALITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Repetição</label>
                  <select
                    className="w-full p-2 border rounded-lg"
                    value={newPreventive.repetition}
                    onChange={(e) => setNewPreventive({ ...newPreventive, repetition: e.target.value })}
                    required
                  >
                    {REPETITION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Data Inicial</label>
                  <input
                    type="datetime-local"
                    className="w-full p-2 border rounded-lg"
                    value={newPreventive.start_date}
                    onChange={(e) => setNewPreventive({ ...newPreventive, start_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">Materiais Necessários</label>
                <div className="space-y-3">
                  {newPreventive.materials.map((material, index) => (
                    <div key={index} className="flex gap-3 items-center">
                      <input
                        type="text"
                        placeholder="Nome do material"
                        className="flex-1 p-2 border rounded-lg"
                        value={material.name}
                        onChange={(e) => {
                          const materials = [...newPreventive.materials];
                          materials[index].name = e.target.value;
                          setNewPreventive({ ...newPreventive, materials });
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Qtd"
                        className="w-20 p-2 border rounded-lg"
                        value={material.quantity}
                        onChange={(e) => {
                          const materials = [...newPreventive.materials];
                          materials[index].quantity = Number(e.target.value);
                          setNewPreventive({ ...newPreventive, materials });
                        }}
                        min="1"
                      />
                      <button
                        type="button"
                        onClick={() => setNewPreventive({
                          ...newPreventive,
                          materials: newPreventive.materials.filter((_, i) => i !== index)
                        })}
                        className="text-red-500 hover:text-red-700"
                      >×</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewPreventive({
                      ...newPreventive,
                      materials: [...newPreventive.materials, { name: '', quantity: 1 }]
                    })}
                    className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
                  >
                    <Plus size={16} className="mr-1" /> Adicionar Material
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button type="button" onClick={() => { resetForm(); (document.getElementById('preventive_modal') as HTMLDialogElement)?.close(); }} className="px-4 py-2 text-gray-600">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Salvar Preventiva</button>
              </div>
            </form>
          </div>
        </div>
      </dialog>

      {/* Modal de edição */}
      <dialog id="edit_preventive_modal" className="modal">
        <div className="modal-box max-w-3xl bg-white rounded-lg shadow-xl">
          {editingPreventive && (
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Editar Preventiva</h3>
              <form onSubmit={handleUpdatePreventive} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label>Descrição</label>
                    <textarea className="w-full p-2 border rounded" value={editingPreventive.description} onChange={e => setEditingPreventive({ ...editingPreventive, description: e.target.value })} required rows={3} />
                  </div>
                  <div>
                    <label>Máquina</label>
                    {editingPreventive.equipment_id ? (
                      <input type="text" value={editMachineName} disabled className="w-full p-2 border rounded bg-gray-100" />
                    ) : (
                      <select className="w-full p-2 border rounded" value={editingPreventive.machine_id || ''} onChange={async e => {
                        const mid = e.target.value;
                        setEditingPreventive({ ...editingPreventive, machine_id: mid, conjunto_id: '', equipment_id: null });
                        const { data: conj } = await supabase.from('equipment_hierarchy').select('id, name').eq('type', 'Conjunto').eq('parent_id', mid).eq('tenant_id', tenantId);
                        setEditAvailableConjuntos(conj || []);
                        setEditAvailableEquipments([]);
                        setEditMachineName('');
                        setEditConjuntoName('');
                      }}>
                        <option value="">Selecione</option>
                        {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label>Conjunto</label>
                    {editingPreventive.equipment_id ? (
                      <input type="text" value={editConjuntoName} disabled className="w-full p-2 border rounded bg-gray-100" />
                    ) : (
                      <select className="w-full p-2 border rounded" value={editingPreventive.conjunto_id || ''} onChange={async e => {
                        const cid = e.target.value;
                        setEditingPreventive({ ...editingPreventive, conjunto_id: cid, equipment_id: null });
                        const { data: eqs } = await supabase.from('equipment_hierarchy').select('id, name').eq('type', 'Equipamento').eq('parent_id', cid).eq('tenant_id', tenantId);
                        setEditAvailableEquipments(eqs || []);
                        setEditMachineName('');
                        setEditConjuntoName('');
                      }}>
                        <option value="">Selecione</option>
                        {editAvailableConjuntos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label>Equipamento</label>
                    <select className="w-full p-2 border rounded" value={editingPreventive.equipment_id || ''} onChange={async e => {
                      const eqId = e.target.value || null;
                      if (eqId) {
                        const { machine_id, conjunto_id, machineName, conjuntoName } = await getEquipmentHierarchy(eqId);
                        setEditingPreventive({ ...editingPreventive, equipment_id: eqId, machine_id: machine_id || '', conjunto_id: conjunto_id || '' });
                        setEditMachineName(machineName);
                        setEditConjuntoName(conjuntoName);
                      } else {
                        setEditingPreventive({ ...editingPreventive, equipment_id: null });
                        setEditMachineName('');
                        setEditConjuntoName('');
                      }
                    }} disabled={!editingPreventive.conjunto_id && !editingPreventive.equipment_id}>
                      <option value="">Nenhum</option>
                      {editAvailableEquipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                    </select>
                  </div>
                  <div><label>Tipo Manutenção</label><select className="w-full p-2 border rounded" value={editingPreventive.maintenance_type} onChange={e => setEditingPreventive({ ...editingPreventive, maintenance_type: e.target.value })}>{MAINTENANCE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label>Criticidade</label><select className="w-full p-2 border rounded" value={editingPreventive.criticality} onChange={e => setEditingPreventive({ ...editingPreventive, criticality: e.target.value })}>{CRITICALITY_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
                  <div><label>Repetição</label><select className="w-full p-2 border rounded" value={editingPreventive.repetition} onChange={e => setEditingPreventive({ ...editingPreventive, repetition: e.target.value })}>{REPETITION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                  <div><label>Data Inicial</label><input type="datetime-local" className="w-full p-2 border rounded" value={editingPreventive.start_date} onChange={e => setEditingPreventive({ ...editingPreventive, start_date: e.target.value })} required /></div>
                </div>
                <div className="space-y-4">
                  <label>Materiais</label>
                  {editingPreventive.materials.map((mat, idx) => (
                    <div key={idx} className="flex gap-2"><input type="text" className="flex-1 p-2 border rounded" value={mat.name} onChange={e => { const mats = [...editingPreventive.materials]; mats[idx].name = e.target.value; setEditingPreventive({ ...editingPreventive, materials: mats }); }} /><input type="number" className="w-20 p-2 border rounded" value={mat.quantity} onChange={e => { const mats = [...editingPreventive.materials]; mats[idx].quantity = Number(e.target.value); setEditingPreventive({ ...editingPreventive, materials: mats }); }} min="1" /><button type="button" onClick={() => setEditingPreventive({ ...editingPreventive, materials: editingPreventive.materials.filter((_, i) => i !== idx) })} className="text-red-500">×</button></div>
                  ))}
                  <button type="button" onClick={() => setEditingPreventive({ ...editingPreventive, materials: [...editingPreventive.materials, { name: '', quantity: 1 }] })} className="text-indigo-600 text-sm">+ Adicionar</button>
                </div>
                <div className="flex justify-between pt-6">
                  <button type="button" onClick={() => deletePreventive(editingPreventive.id)} className="px-4 py-2 bg-red-600 text-white rounded">Excluir</button>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => (document.getElementById('edit_preventive_modal') as HTMLDialogElement)?.close()} className="px-4 py-2 text-gray-600">Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Salvar</button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </dialog>

      {/* Tabela de preventivas */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : preventives.length === 0 ? (
          <div className="text-center p-8 text-gray-500">Nenhuma manutenção preventiva encontrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Descrição</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Local</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Próxima Execução</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Última Execução</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {preventives.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{p.description}</td>
                    <td className="px-6 py-4 text-sm">{p.equipment?.name || `${p.machine?.name} / ${p.conjunto?.name}`}</td>
                    <td className="px-6 py-4 text-sm">{p.maintenance_type}</td>
                    <td className="px-6 py-4 text-sm">{new Date(p.next_execution).toLocaleString('pt-BR')}</td>
                    <td className="px-6 py-4 text-sm">{p.last_triggered ? new Date(p.last_triggered).toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-6 py-4">{getStatusBadge(p.status || 'Pendente')}</td>
                    <td className="px-6 py-4"><button onClick={() => startEditing(p)} className="text-indigo-600"><Edit size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreventiveMaintenancePage;