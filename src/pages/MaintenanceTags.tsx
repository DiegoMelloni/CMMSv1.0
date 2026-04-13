import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Edit, Trash2, Download, RefreshCw } from 'lucide-react';
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

const TagsPDF = ({ selectedTags }: { selectedTags: MaintenanceTag[] }) => (
  <Document>
    {selectedTags.map((tag) => (
      <Page key={tag.id} size="A4" style={styles.page}>
        <Text style={styles.title}>Etiqueta de Manutenção #{tag.tag_number}</Text>
        <View style={styles.status}>
          <Text>Status: {tag.status}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Número da Etiqueta:</Text>
          <Text style={styles.value}>{tag.tag_number}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Máquina:</Text>
          <Text style={styles.value}>{tag.machine?.name || 'Não informado'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Conjunto:</Text>
          <Text style={styles.value}>{tag.conjunto?.name || 'Não informado'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Solicitante:</Text>
          <Text style={styles.value}>{tag.requester}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Data de Criação:</Text>
          <Text style={styles.value}>
            {new Date(tag.created_at).toLocaleDateString('pt-BR')}
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Criticidade:</Text>
          <Text style={styles.value}>{tag.criticality}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Tipo de Manutenção:</Text>
          <Text style={styles.value}>{tag.maintenance_type}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Descrição:</Text>
          <Text style={styles.value}>{tag.description || 'Sem descrição'}</Text>
        </View>
        {tag.preventive_id && (
          <View style={styles.section}>
            <Text style={styles.label}>Preventiva Associada:</Text>
            <Text style={styles.value}>{tag.preventive?.description || 'Não informado'}</Text>
          </View>
        )}
        <View style={styles.divider} />
      </Page>
    ))}
  </Document>
);

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

const MaintenanceTags = () => {
  const navigate = useNavigate();
  const [tags, setTags] = useState<MaintenanceTag[]>([]);
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [conjuntos, setConjuntos] = useState<Equipment[]>([]);
  const [newTag, setNewTag] = useState({
    tag_number: '',
    requester: '',
    machine_id: '',
    conjunto_id: '',
    criticality: 'B',
    status: 'Pendente',
    description: '',
    type: 'Corretiva',
    maintenance_type: 'Mecânica',
    tenant_id: '',
    preventive_id: null as string | null,
  });
  const [editingTag, setEditingTag] = useState<MaintenanceTag | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [searchDescription, setSearchDescription] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTags, setSelectedTags] = useState<MaintenanceTag[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          navigate('/login');
          return;
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();
        if (!profile) {
          navigate('/login');
          return;
        }
        setTenantId(profile.tenant_id);
        setNewTag((prev) => ({ ...prev, tenant_id: profile.tenant_id }));
        await fetchMachines(profile.tenant_id);
        await fetchTags(profile.tenant_id);
        setupRealtimeUpdates(profile.tenant_id);
      } catch (error) {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [navigate]);

  const setupRealtimeUpdates = (tenantId: string) => {
    return supabase
      .channel('maintenance-tags-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'maintenance_tags',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchTags(tenantId))
      .subscribe();
  };

  const fetchMachines = async (tenantId: string) => {
    const { data } = await supabase
      .from('equipment_hierarchy')
      .select('id, name, tenant_id')
      .eq('type', 'Maquina')
      .eq('tenant_id', tenantId)
      .order('name');
    setMachines(data || []);
  };

  const fetchConjuntos = async (machineId: string) => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('equipment_hierarchy')
      .select('id, name, tenant_id')
      .eq('type', 'Conjunto')
      .eq('parent_id', machineId)
      .eq('tenant_id', tenantId)
      .order('name');
    setConjuntos(data || []);
  };

  const fetchTags = async (tenantId: string) => {
    const { data } = await supabase
      .from('maintenance_tags')
      .select(`
        *,
        machine:equipment_hierarchy!machine_id (name),
        conjunto:equipment_hierarchy!conjunto_id (name),
        preventive:preventive_maintenances!preventive_id (description)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setTags(data as MaintenanceTag[] || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!tenantId) return;

      if (newTag.type === 'Preventiva') {
        const { data: existingPreventive } = await supabase
          .from('maintenance_tags')
          .select('id')
          .eq('machine_id', newTag.machine_id)
          .eq('conjunto_id', newTag.conjunto_id)
          .eq('description', newTag.description)
          .eq('tenant_id', tenantId);
        if (existingPreventive?.length) {
          alert('Já existe uma tag preventiva para esta combinação!');
          return;
        }
      }

      if (editingTag) {
        // Atualização da tag existente
        const { error } = await supabase
          .from('maintenance_tags')
          .update({
            ...newTag,
            preventive_id: newTag.preventive_id || null,
          })
          .eq('id', editingTag.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;

        // Se o status foi alterado para Confirmada e a tag possui preventiva, atualizar a preventiva
        if (newTag.status === 'Confirmada' && newTag.preventive_id) {
          const { data: preventive, error: prevError } = await supabase
            .from('preventive_maintenances')
            .select('repetition, next_execution')
            .eq('id', newTag.preventive_id)
            .maybeSingle(); // <- usar maybeSingle()
          if (prevError) throw prevError;
          if (preventive) {
            const nextDate = addRepetition(preventive.next_execution, preventive.repetition);
            const now = new Date().toISOString();
            await supabase
              .from('preventive_maintenances')
              .update({
                next_execution: nextDate,
                last_triggered: now,
                current_status: 'Pendente'
              })
              .eq('id', newTag.preventive_id);
          }
        }
        setEditingTag(null);
      } else {
        // Criação de nova tag
        const { data: conjunto } = await supabase
          .from('equipment_hierarchy')
          .select('parent_id')
          .eq('id', newTag.conjunto_id)
          .eq('tenant_id', tenantId)
          .single();
        if (conjunto?.parent_id !== newTag.machine_id) {
          alert('Conjunto não pertence à máquina selecionada!');
          return;
        }
        const { error } = await supabase
          .from('maintenance_tags')
          .insert([{
            ...newTag,
            tenant_id: tenantId,
            preventive_id: newTag.preventive_id || null,
            tag_number: newTag.tag_number.trim() !== '' ? newTag.tag_number : (newTag.type === 'Preventiva' ? `PREV-${Date.now()}` : ''),
          }]);
        if (error) throw error;
      }

      setNewTag({
        tag_number: '',
        requester: '',
        machine_id: '',
        conjunto_id: '',
        criticality: 'B',
        status: 'Pendente',
        description: '',
        type: 'Corretiva',
        maintenance_type: 'Mecânica',
        tenant_id: tenantId,
        preventive_id: null,
      });
      await fetchTags(tenantId);
    } catch (error: any) {
      if (error.code === '23505') {
        alert('Número de etiqueta já existe!');
      } else {
        console.error('Erro:', error);
        alert('Erro ao salvar: ' + error.message);
      }
    }
  };

  const handleEdit = (tag: MaintenanceTag) => {
    setEditingTag(tag);
    setNewTag({
      tag_number: tag.tag_number,
      requester: tag.requester,
      machine_id: tag.machine_id,
      conjunto_id: tag.conjunto_id,
      criticality: tag.criticality,
      status: tag.status,
      description: tag.description,
      type: tag.type,
      maintenance_type: tag.maintenance_type,
      tenant_id: tag.tenant_id,
      preventive_id: tag.preventive_id || null,
    });
    fetchConjuntos(tag.machine_id);
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Confirmar exclusão?')) return;
    try {
      const { error } = await supabase
        .from('maintenance_tags')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      await fetchTags(tenantId);
    } catch (error) {
      console.error('Erro ao excluir:', error);
    }
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setNewTag({
      tag_number: '',
      requester: '',
      machine_id: '',
      conjunto_id: '',
      criticality: 'B',
      status: 'Pendente',
      description: '',
      type: 'Corretiva',
      maintenance_type: 'Mecânica',
      tenant_id: tenantId || '',
      preventive_id: null,
    });
  };

  const filteredTags = tags.filter((tag) => {
    const tagDate = new Date(tag.created_at);
    const startFilter = startDate ? new Date(startDate) : null;
    const endFilter = endDate ? new Date(endDate) : null;
    if (startFilter) startFilter.setHours(0, 0, 0, 0);
    if (endFilter) endFilter.setHours(23, 59, 59, 999);
    return (
      (!startFilter || tagDate >= startFilter) &&
      (!endFilter || tagDate <= endFilter) &&
      (!selectedMachine || tag.machine_id === selectedMachine) &&
      (!searchDescription || tag.description.toLowerCase().includes(searchDescription.toLowerCase())) &&
      (!selectedStatus || tag.status === selectedStatus)
    );
  });

  const handleSelectTag = (tag: MaintenanceTag) => {
    setSelectedTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) {
        return prev.filter((t) => t.id !== tag.id);
      }
      return [...prev, tag];
    });
  };

  const handleSelectAllTags = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTags(filteredTags);
    } else {
      setSelectedTags([]);
    }
  };

  const exportToExcel = () => {
    if (selectedTags.length === 0) {
      alert('Selecione pelo menos uma etiqueta para exportar!');
      return;
    }
    const filteredData = selectedTags.map((tag) => ({
      'Etiqueta': tag.tag_number,
      'Máquina': tag.machine?.name || 'N/A',
      'Conjunto': tag.conjunto?.name || 'N/A',
      'Solicitante': tag.requester,
      'Data': new Date(tag.created_at).toLocaleDateString('pt-BR'),
      'Status': tag.status,
      'Criticidade': tag.criticality,
      'Tipo': tag.type,
      'Manutenção': tag.maintenance_type,
      'Descrição': tag.description,
    }));
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Etiquetas');
    XLSX.writeFile(workbook, `etiquetas-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePDFExport = (e: React.MouseEvent) => {
    if (selectedTags.length === 0) {
      e.preventDefault();
      alert('Selecione pelo menos uma etiqueta para exportar para PDF!');
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedMachine('');
    setSearchDescription('');
    setSelectedStatus('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">Gestão de Etiquetas</h1>

      {/* Seção de Filtros */}
      <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Data Inicial</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Data Final</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 border rounded-md" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Máquina</label>
            <select value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)} className="w-full p-2 border rounded-md">
              <option value="">Todas</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="w-full p-2 border rounded-md">
              <option value="">Todos</option>
              <option value="Pendente">Pendente</option>
              <option value="Programada">Programada</option>
              <option value="Confirmada">Confirmada</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Descrição</label>
            <input type="text" value={searchDescription} onChange={(e) => setSearchDescription(e.target.value)} placeholder="Buscar..." className="w-full p-2 border rounded-md" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchTags(tenantId!)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2">
            <RefreshCw size={18} /> Atualizar
          </button>
          <button onClick={handleResetFilters} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Limpar Filtros
          </button>
          <button onClick={exportToExcel} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2">
            <Download size={18} /> Exportar Excel
          </button>
          <div onClick={handlePDFExport}>
            <PDFDownloadLink
              document={<TagsPDF selectedTags={selectedTags} />}
              fileName="etiquetas-selecionadas.pdf"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
              disabled={selectedTags.length === 0}
            >
              {({ loading }) => loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={18} className="animate-spin" /> Gerando PDF...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download size={18} /> Exportar PDF
                </span>
              )}
            </PDFDownloadLink>
          </div>
        </div>
      </div>

      {/* Formulário de criação/edição */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Número da Etiqueta</label>
            <input
              type="text"
              required
              value={newTag.tag_number}
              onChange={(e) => setNewTag({ ...newTag, tag_number: e.target.value })}
              className="w-full p-2 border rounded-md"
              placeholder="Número único"
              disabled={!!newTag.preventive_id}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Solicitante</label>
            <input
              type="text"
              required
              value={newTag.requester}
              onChange={(e) => setNewTag({ ...newTag, requester: e.target.value })}
              className="w-full p-2 border rounded-md"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Máquina</label>
            <select
              value={newTag.machine_id}
              onChange={async (e) => {
                const machineId = e.target.value;
                setNewTag({ ...newTag, machine_id: machineId, conjunto_id: '' });
                await fetchConjuntos(machineId);
              }}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="">Selecione uma máquina</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Conjunto</label>
            <select
              value={newTag.conjunto_id}
              onChange={(e) => setNewTag({ ...newTag, conjunto_id: e.target.value })}
              className="w-full p-2 border rounded-md"
              disabled={!newTag.machine_id}
              required
            >
              <option value="">Selecione um conjunto</option>
              {conjuntos.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Criticidade</label>
            <select
              value={newTag.criticality}
              onChange={(e) => setNewTag({ ...newTag, criticality: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="A">Crítica (A)</option>
              <option value="B">Alta (B)</option>
              <option value="C">Normal (C)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Tipo</label>
            <select
              value={newTag.type}
              onChange={(e) => setNewTag({ ...newTag, type: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="Corretiva">Corretiva</option>
              <option value="Preventiva">Preventiva</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Tipo de Manutenção</label>
            <select
              value={newTag.maintenance_type}
              onChange={(e) => setNewTag({ ...newTag, maintenance_type: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="Mecânica">Mecânica</option>
              <option value="Elétrica">Elétrica</option>
            </select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Descrição</label>
            <textarea
              value={newTag.description}
              onChange={(e) => setNewTag({ ...newTag, description: e.target.value })}
              className="w-full p-2 border rounded-md h-32"
              placeholder="Descreva o problema..."
              required
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            {editingTag ? 'Atualizar' : 'Criar Etiqueta'}
          </button>
          {editingTag && (
            <button type="button" onClick={cancelEdit} className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Tabela de etiquetas */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600"
                  checked={selectedTags.length === filteredTags.length && filteredTags.length > 0}
                  onChange={handleSelectAllTags}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etiqueta</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Máquina</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conjunto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criticidade</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manutenção</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTags.map((tag) => (
              <tr key={tag.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600"
                    checked={selectedTags.some((t) => t.id === tag.id)}
                    onChange={() => handleSelectTag(tag)}
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {tag.tag_number}
                  {tag.preventive_id && <span className="ml-1 text-xs text-blue-600">(Auto)</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.preventive ? tag.preventive.description : 'Manual'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(tag.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.requester}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.machine?.name || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.conjunto?.name || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${tag.criticality === 'A' ? 'bg-red-100 text-red-800' : tag.criticality === 'B' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                    }`}>
                    {tag.criticality}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${tag.status === 'Pendente' ? 'bg-blue-100 text-blue-800' : tag.status === 'Programada' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                    }`}>
                    {tag.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.type}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{tag.maintenance_type}</td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => handleEdit(tag)}
                    className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                    disabled={!!tag.preventive_id}
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                    disabled={!!tag.preventive_id}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MaintenanceTags;