import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronRight, Edit, Save, X, Trash2 } from 'lucide-react';

type Equipment = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  tenant_id: string;
  criticality?: string | null;
  children?: Equipment[];
};

type UserProfile = {
  id: string;
  role: 'admin' | 'programmer' | 'user';
};

const equipmentHierarchy = [
  'Planta',
  'Area',
  'Linha',
  'Maquina',
  'Conjunto',
  'Equipamento',
  'Componente',
];

const criticalityOptions = ['Crítico', 'Alto', 'Normal', 'Equipamento Reserva'];

export function EquipmentTree() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [flatEquipment, setFlatEquipment] = useState<Equipment[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filteredParents, setFilteredParents] = useState<Equipment[]>([]);
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    type: 'Planta' as typeof equipmentHierarchy[number],
    parent_id: null as string | null,
    criticality: '' as string | null,
  });
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserProfile['role']>('user');

  // Obter tenant_id e role do usuário
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('user_profiles')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .single();
        
      if (data) {
        setTenantId(data.tenant_id);
        setUserRole(data.role);
      }
    };
    
    fetchUserData();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchEquipment();
    }
  }, [tenantId]);

  async function fetchEquipment() {
    try {
      if (!tenantId) return;
      
      setLoading(true);
      const { data, error } = await supabase
        .from('equipment_hierarchy')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const sortedData = data.map(item => ({
        ...item,
        id: item.id.toString(),
        parent_id: item.parent_id?.toString() || null,
        criticality: item.criticality || null,
        children: []
      }));

      setFlatEquipment(sortedData);
      const tree = buildTree(sortedData);
      setEquipment(tree);
      updateFilteredParents(newEquipment.type, sortedData);
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  }

  function buildTree(data: Equipment[]): Equipment[] {
    const map = new Map<string, Equipment>();
    const tree: Equipment[] = [];
    
    data.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    data.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parent_id) {
        const parent = map.get(item.parent_id);
        parent?.children?.push(node);
      } else {
        tree.push(node);
      }
    });

    const sortChildren = (nodes: Equipment[]): Equipment[] => {
      return nodes.sort((a, b) => a.name.localeCompare(b.name)).map(node => ({
        ...node,
        children: node.children ? sortChildren(node.children) : []
      }));
    };

    return sortChildren(tree);
  }

  function updateFilteredParents(type: string, equipmentList: Equipment[]) {
    const typeIndex = equipmentHierarchy.indexOf(type);
    const parentType = equipmentHierarchy[typeIndex - 1];
    
    if (typeIndex > 0) {
      const filtered = equipmentList.filter(eq => 
        eq.type === parentType && eq.id !== editingEquipment?.id
      );
      setFilteredParents(filtered);
    } else {
      setFilteredParents([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!tenantId) return;
      
      if (editingEquipment) {
        // Validação: equipamento precisa de pai
        const typeIndex = equipmentHierarchy.indexOf(editingEquipment.type);
        if (typeIndex > 0 && !editingEquipment.parent_id) {
          alert('Selecione um equipamento pai para este tipo');
          return;
        }

        const updateData: any = {
          name: editingEquipment.name,
          type: editingEquipment.type,
          parent_id: typeIndex === 0 ? null : editingEquipment.parent_id,
        };
        // Só inclui criticality se for do tipo Equipamento
        if (editingEquipment.type === 'Equipamento') {
          updateData.criticality = editingEquipment.criticality || null;
        } else {
          updateData.criticality = null;
        }

        const { error } = await supabase
          .from('equipment_hierarchy')
          .update(updateData)
          .eq('id', editingEquipment.id);

        if (error) throw error;
        setEditingEquipment(null);
      } else {
        // Criação de novo equipamento
        const typeIndex = equipmentHierarchy.indexOf(newEquipment.type);
        if (typeIndex > 0 && !newEquipment.parent_id) {
          alert('Selecione um equipamento pai para este tipo');
          return;
        }

        const insertData: any = {
          name: newEquipment.name,
          type: newEquipment.type,
          parent_id: typeIndex === 0 ? null : newEquipment.parent_id,
          tenant_id: tenantId,
        };
        if (newEquipment.type === 'Equipamento') {
          insertData.criticality = newEquipment.criticality || null;
        }

        const { error } = await supabase
          .from('equipment_hierarchy')
          .insert([insertData]);

        if (error) throw error;
        setNewEquipment({ name: '', type: 'Planta', parent_id: null, criticality: '' });
      }
      
      await fetchEquipment();
    } catch (error) {
      console.error('Error saving equipment:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir este equipamento?')) return;
    
    try {
      const { error } = await supabase
        .from('equipment_hierarchy')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchEquipment();
    } catch (error) {
      console.error('Error deleting equipment:', error);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const newExpanded = new Set(prev);
      newExpanded.has(id) ? newExpanded.delete(id) : newExpanded.add(id);
      return newExpanded;
    });
  }

  function renderEquipmentNode(node: Equipment, level = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isEditing = editingEquipment?.id === node.id;
    const hierarchyIndex = equipmentHierarchy.indexOf(node.type);
    const nextLevelType = equipmentHierarchy[hierarchyIndex + 1];
    const canEdit = ['admin', 'programmer'].includes(userRole);
    const isEquipamento = node.type === 'Equipamento';

    return (
      <div key={node.id}>
        <div 
          className="flex items-center py-2 hover:bg-gray-50 group"
          style={{ marginLeft: `${level * 32}px` }}
        >
          <div 
            className="mr-2 cursor-pointer"
            onClick={() => hasChildren && toggleExpand(node.id)}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <span className="w-4 h-4 inline-block" />
            )}
          </div>
          
          {isEditing ? (
            <form 
              className="flex-1 flex gap-4 items-center flex-wrap"
              onSubmit={handleSubmit}
            >
              <input
                type="text"
                required
                value={editingEquipment.name}
                onChange={(e) => setEditingEquipment({
                  ...editingEquipment,
                  name: e.target.value
                })}
                className="p-1 border rounded w-40"
              />
              
              <select
                value={editingEquipment.type}
                onChange={(e) => {
                  const type = e.target.value as typeof equipmentHierarchy[number];
                  setEditingEquipment({
                    ...editingEquipment,
                    type,
                    parent_id: null,
                    criticality: type === 'Equipamento' ? editingEquipment.criticality : null
                  });
                  updateFilteredParents(type, flatEquipment);
                }}
                className="p-1 border rounded w-32"
              >
                {equipmentHierarchy.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>

              <select
                value={editingEquipment.parent_id || ''}
                onChange={(e) => setEditingEquipment({
                  ...editingEquipment,
                  parent_id: e.target.value || null
                })}
                className="p-1 border rounded w-48"
                disabled={equipmentHierarchy.indexOf(editingEquipment.type) === 0}
              >
                <option value="">Nenhum</option>
                {filteredParents.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name} ({eq.type})</option>
                ))}
              </select>

              {editingEquipment.type === 'Equipamento' && (
                <select
                  value={editingEquipment.criticality || ''}
                  onChange={(e) => setEditingEquipment({
                    ...editingEquipment,
                    criticality: e.target.value || null
                  })}
                  className="p-1 border rounded w-40"
                >
                  <option value="">Sem criticidade</option>
                  {criticalityOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="text-green-600 hover:text-green-700"
                  title="Salvar"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEquipment(null)}
                  className="text-red-600 hover:text-red-700"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-medium">{node.name}</span>
                <span className="text-sm text-gray-500">
                  ({node.type}) {hasChildren && `→ ${nextLevelType}`}
                </span>
                {isEquipamento && node.criticality && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    node.criticality === 'Crítico' ? 'bg-red-100 text-red-800' :
                    node.criticality === 'Alto' ? 'bg-orange-100 text-orange-800' :
                    node.criticality === 'Normal' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {node.criticality}
                  </span>
                )}
              </div>
              
              {canEdit && (
                <div className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditingEquipment(node);
                      updateFilteredParents(node.type, flatEquipment);
                    }}
                    className="text-blue-600 hover:text-blue-700"
                    title="Editar"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(node.id)}
                    className="text-red-600 hover:text-red-700"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        
        {isExpanded && node.children?.map(child => 
          renderEquipmentNode(child, level + 1)
        )}
      </div>
    );
  }

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
      <h1 className="text-2xl font-bold text-gray-900">Hierarquia de Equipamentos</h1>
      
      {['admin', 'programmer'].includes(userRole) && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                type="text"
                required
                value={newEquipment.name}
                onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={newEquipment.type}
                onChange={(e) => {
                  const type = e.target.value as typeof equipmentHierarchy[number];
                  setNewEquipment({ ...newEquipment, type, parent_id: null, criticality: '' });
                  updateFilteredParents(type, flatEquipment);
                }}
                className="w-full p-2 border rounded"
              >
                {equipmentHierarchy.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Equipamento Pai</label>
              <select
                value={newEquipment.parent_id || ''}
                onChange={(e) => setNewEquipment({ ...newEquipment, parent_id: e.target.value || null })}
                className="w-full p-2 border rounded"
                disabled={equipmentHierarchy.indexOf(newEquipment.type) === 0}
              >
                <option value="">Nenhum</option>
                {filteredParents.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name} ({eq.type})</option>
                ))}
              </select>
            </div>

            {newEquipment.type === 'Equipamento' && (
              <div>
                <label className="block text-sm font-medium mb-1">Criticidade</label>
                <select
                  value={newEquipment.criticality || ''}
                  onChange={(e) => setNewEquipment({ ...newEquipment, criticality: e.target.value || null })}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Sem criticidade</option>
                  {criticalityOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <button
            type="submit"
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Adicionar Equipamento
          </button>
        </form>
      )}

      <div className="bg-white p-6 rounded-lg shadow border">
        {loading ? (
          <div className="text-center text-gray-500 py-4">Carregando...</div>
        ) : equipment.length > 0 ? (
          equipment.map(node => renderEquipmentNode(node))
        ) : (
          <div className="text-center text-gray-500 py-4">
            Nenhum equipamento cadastrado
          </div>
        )}
      </div>
    </div>
  );
}