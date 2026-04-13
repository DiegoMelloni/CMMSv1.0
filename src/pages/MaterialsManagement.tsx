import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Edit, Trash2, Download } from 'lucide-react';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import * as XLSX from 'xlsx';

const styles = StyleSheet.create({
  page: {
    padding: 30,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  section: {
    marginBottom: 10,
  },
  header: {
    fontSize: 18,
    marginBottom: 10,
  },
  text: {
    fontSize: 12,
    marginBottom: 5,
  },
  pageBreak: {
    marginBottom: 20,
    borderBottom: '1px solid #ccc',
    paddingBottom: 10
  },
});

interface StockMaterial {
  id: number;
  material_name: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

const StockPDF = ({ selectedMaterials }: { selectedMaterials: StockMaterial[] }) => (
  <Document>
    {selectedMaterials.map((material) => (
      <Page key={material.id} size="A4" style={styles.page}>
        <View style={styles.pageBreak}>
          <Text style={styles.title}>Estoque de Materiais</Text>
          <Text style={styles.text}>Material: {material.material_name}</Text>
          <Text style={styles.text}>Quantidade em estoque: {material.quantity}</Text>
          <Text style={styles.text}>
            Cadastrado em: {new Date(material.created_at).toLocaleDateString('pt-BR')}
          </Text>
          <Text style={styles.text}>
            Última atualização: {new Date(material.updated_at).toLocaleDateString('pt-BR')}
          </Text>
        </View>
      </Page>
    ))}
  </Document>
);

export default function MaterialsManagement() {
  const [materials, setMaterials] = useState<StockMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<StockMaterial | null>(null);
  const [newMaterialData, setNewMaterialData] = useState({
    material_name: '',
    quantity: 1,
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<StockMaterial[]>([]);

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
      fetchMaterials();
    }
  }, [tenantId]);

  const fetchMaterials = async () => {
    try {
      if (!tenantId) return;
      
      setLoading(true);
      const { data, error } = await supabase
        .from('materials_stock')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('material_name', { ascending: true });

      if (error) throw error;
      setMaterials(data as StockMaterial[]);
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMaterial = (material: StockMaterial) => {
    setSelectedMaterials(prev => {
      if (prev.some(m => m.id === material.id)) {
        return prev.filter(m => m.id !== material.id);
      }
      return [...prev, material];
    });
  };

  const handleSelectAllMaterials = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedMaterials(filteredMaterials);
    } else {
      setSelectedMaterials([]);
    }
  };

  const exportToExcel = () => {
    if (selectedMaterials.length === 0) {
      alert('Selecione pelo menos um material para exportar!');
      return;
    }

    const filteredData = selectedMaterials.map(material => ({
      'Material': material.material_name,
      'Quantidade em estoque': material.quantity,
      'Cadastrado em': new Date(material.created_at).toLocaleDateString('pt-BR'),
      'Atualizado em': new Date(material.updated_at).toLocaleDateString('pt-BR'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');
    XLSX.writeFile(workbook, `estoque-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePDFExport = (e: React.MouseEvent) => {
    if (selectedMaterials.length === 0) {
      e.preventDefault();
      alert('Selecione pelo menos um material para exportar para PDF!');
    }
  };

  const handleCreateMaterial = async () => {
    if (!newMaterialData.material_name.trim()) {
      alert('Nome do material é obrigatório!');
      return;
    }
    if (newMaterialData.quantity < 0) {
      alert('Quantidade não pode ser negativa!');
      return;
    }
    try {
      if (!tenantId) return;
      
      const { error } = await supabase
        .from('materials_stock')
        .insert([{
          material_name: newMaterialData.material_name.trim(),
          quantity: newMaterialData.quantity,
          tenant_id: tenantId
        }]);

      if (error) throw error;
      setIsModalOpen(false);
      fetchMaterials();
      resetForm();
    } catch (error) {
      console.error('Error creating material:', error);
    }
  };

  const handleUpdateMaterial = async () => {
    if (!editingMaterial || !tenantId) return;
    if (!newMaterialData.material_name.trim()) {
      alert('Nome do material é obrigatório!');
      return;
    }
    if (newMaterialData.quantity < 0) {
      alert('Quantidade não pode ser negativa!');
      return;
    }
    try {
      const { error } = await supabase
        .from('materials_stock')
        .update({
          material_name: newMaterialData.material_name.trim(),
          quantity: newMaterialData.quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingMaterial.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      setIsModalOpen(false);
      fetchMaterials();
      resetForm();
    } catch (error) {
      console.error('Error updating material:', error);
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este material do estoque?') || !tenantId) return;

    try {
      const { error } = await supabase
        .from('materials_stock')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      fetchMaterials();
    } catch (error) {
      console.error('Error deleting material:', error);
    }
  };

  const resetForm = () => {
    setNewMaterialData({
      material_name: '',
      quantity: 1,
    });
    setEditingMaterial(null);
  };

  const filteredMaterials = materials.filter(material =>
    material.material_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <h1 className="text-2xl font-bold text-gray-900">Estoque de Materiais</h1>
        <div className="flex gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsModalOpen(true);
                setEditingMaterial(null);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Novo Material
            </button>
            
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <Download size={18} />
              Excel
            </button>

            <div onClick={handlePDFExport}>
              <PDFDownloadLink
                document={<StockPDF selectedMaterials={selectedMaterials} />}
                fileName="estoque-selecionado.pdf"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                disabled={selectedMaterials.length === 0}
              >
                {({ loading }) => loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">↻</span>
                    PDF
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download size={18} />
                    PDF
                  </span>
                )}
              </PDFDownloadLink>
            </div>
          </div>
          
          <input
            type="text"
            placeholder="Pesquisar material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm px-4 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingMaterial ? 'Editar Material' : 'Novo Material'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome do Material</label>
                <input
                  type="text"
                  value={newMaterialData.material_name}
                  onChange={(e) => setNewMaterialData({...newMaterialData, material_name: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantidade em Estoque</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newMaterialData.quantity}
                  onChange={(e) => setNewMaterialData({...newMaterialData, quantity: parseInt(e.target.value) || 0})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={editingMaterial ? handleUpdateMaterial : handleCreateMaterial}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingMaterial ? 'Salvar Alterações' : 'Adicionar ao Estoque'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={selectedMaterials.length === filteredMaterials.length && filteredMaterials.length > 0}
                  onChange={handleSelectAllMaterials}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantidade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cadastrado em</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Atualizado em</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMaterials.map((material) => (
              <tr key={material.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedMaterials.some(m => m.id === material.id)}
                    onChange={() => handleSelectMaterial(material)}
                  />
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                  {material.material_name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {material.quantity}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(material.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(material.updated_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 flex gap-3">
                  <button
                    onClick={() => {
                      setIsModalOpen(true);
                      setEditingMaterial(material);
                      setNewMaterialData({
                        material_name: material.material_name,
                        quantity: material.quantity,
                      });
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit size={18} className="inline-block" />
                  </button>
                  <button
                    onClick={() => handleDeleteMaterial(material.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 size={18} className="inline-block" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div className="p-4 text-center text-gray-500">
            Carregando...
          </div>
        )}
        {!loading && filteredMaterials.length === 0 && (
          <div className="p-4 text-center text-gray-500">
            Nenhum material encontrado no estoque
          </div>
        )}
      </div>
    </div>
  );
}