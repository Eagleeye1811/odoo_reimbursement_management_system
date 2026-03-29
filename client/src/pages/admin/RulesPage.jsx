import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Plus, GripVertical, Trash2, Edit2, Info } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import api from '../../lib/axios';

export const RulesPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    conditionType: 'none',
    percentageThreshold: '',
    autoApproverId: '',
    steps: []
  });

  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return data;
    }
  });
  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');

  const { data: chains = [], isLoading: chainsLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: async () => {
      const { data } = await api.get('/admin/chains');
      return data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      await api.post('/admin/chains', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      closeForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      await api.put(`/admin/chains/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      closeForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/chains/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
    }
  });

  const openNewForm = () => {
    setEditingId(null);
    setForm({ name: '', conditionType: 'none', percentageThreshold: '', autoApproverId: '', steps: [{ approverId: '' }] });
    setIsFormOpen(true);
  };

  const openEditForm = (chain) => {
    setEditingId(chain.id);
    setForm({
      name: chain.name,
      conditionType: chain.condition_type || 'none',
      percentageThreshold: chain.percentage_threshold || '',
      autoApproverId: chain.auto_approver_id || '',
      steps: chain.steps.map(s => ({ approverId: s.approver_id }))
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleAddStep = () => {
    setForm(prev => ({ ...prev, steps: [...prev.steps, { approverId: '' }] }));
  };

  const handleRemoveStep = (index) => {
    setForm(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const handleStepChange = (index, approverId) => {
    const newSteps = [...form.steps];
    newSteps[index].approverId = approverId;
    setForm({ ...form, steps: newSteps });
  };

  const moveStep = (index, direction) => {
    const newSteps = [...form.steps];
    if (direction === 'up' && index > 0) {
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    } else if (direction === 'down' && index < newSteps.length - 1) {
      [newSteps[index + 1], newSteps[index]] = [newSteps[index], newSteps[index + 1]];
    }
    setForm({ ...form, steps: newSteps });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Name required");
    if (form.steps.length === 0) return alert("At least one step required");
    if (form.steps.some(s => !s.approverId)) return alert("All steps must have an approver assigned");

    const payload = {
      name: form.name,
      conditionType: form.conditionType,
      percentageThreshold: form.conditionType === 'percentage' || form.conditionType === 'hybrid' ? Number(form.percentageThreshold) : null,
      autoApproverId: form.conditionType === 'specific' || form.conditionType === 'hybrid' ? form.autoApproverId : null,
      steps: form.steps
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const renderRuleSummary = (chain) => {
    if (chain.condition_type === 'percentage') return `${chain.percentage_threshold}% Approval resolves automatically`;
    if (chain.condition_type === 'specific') return `Auto-approved if ${chain.auto_approver_name || 'Specific Approver'} approves`;
    if (chain.condition_type === 'hybrid') return `${chain.percentage_threshold}% OR ${chain.auto_approver_name || 'Specific Approver'} approves`;
    return 'Sequential steps';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between bg-surface p-6 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Approval Chains</h2>
          <p className="text-sm text-text-secondary mt-1">Configure how expenses are routed for approval through managers.</p>
        </div>
        <Button onClick={openNewForm} className="bg-primary text-white hover:bg-primary-hover shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Create New Chain
        </Button>
      </div>

      <div className="grid gap-4">
        {chainsLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading chains...</div>
        ) : chains.length === 0 ? (
          <div className="p-8 text-center bg-surface border border-border rounded-xl">
            <p className="text-text-secondary mb-4">No approval chains defined yet.</p>
            <Button onClick={openNewForm} variant="secondary">Create your first chain</Button>
          </div>
        ) : (
          chains.map((chain) => (
            <div key={chain.id} className="bg-surface border border-border rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:shadow-soft transition-shadow">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-bold text-text-primary">{chain.name}</h3>
                  <Badge status="approved">{chain.steps.length} Step{chain.steps.length !== 1 ? 's' : ''}</Badge>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {chain.steps.map((step, idx) => (
                    <React.Fragment key={step.id}>
                      <span className="text-sm bg-primary-light text-primary px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm font-medium">
                        {idx + 1}. {step.approver_name}
                      </span>
                      {idx < chain.steps.length - 1 && <span className="text-text-secondary font-bold">→</span>}
                    </React.Fragment>
                  ))}
                  {chain.steps.length === 0 && <span className="text-sm text-text-secondary italic">No steps</span>}
                </div>

                <div className="flex items-center gap-2 text-sm text-text-secondary bg-gray-50 p-2 rounded-lg inline-flex">
                  <Info className="h-4 w-4 text-amber-500" />
                  {renderRuleSummary(chain)}
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center mt-4 sm:mt-0 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-4 sm:pt-0 border-border">
                <Button variant="secondary" size="sm" onClick={() => openEditForm(chain)} className="bg-white border-border hover:bg-gray-50 hover:text-primary">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { if(window.confirm('Delete this chain?')) deleteMutation.mutate(chain.id); }} className="text-error bg-white border-border hover:bg-red-50">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={closeForm} title={editingId ? 'Edit Approval Chain' : 'Create Approval Chain'}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Info */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2">Chain Name</label>
            <Input 
              placeholder="e.g. High Value Approval" 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})} 
              required
              className="bg-white"
            />
          </div>

          <hr className="border-border" />

          {/* Section 2: Steps */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-semibold text-text-primary">Approval Routing Steps</label>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddStep} className="bg-blue-50 text-primary hover:bg-primary-light border-blue-100">
                <Plus className="h-4 w-4 mr-1" /> Add Step
              </Button>
            </div>
            
            <div className="space-y-3">
              {form.steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 items-center bg-gray-50 border border-gray-200 p-3 rounded-xl shadow-sm relative group">
                  <div className="flex flex-col gap-1 text-gray-400">
                    <button type="button" onClick={() => moveStep(idx, 'up')} disabled={idx === 0} className="hover:text-primary disabled:opacity-30"><GripVertical className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center justify-center bg-white border border-border w-8 h-8 rounded-full font-bold text-primary shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <select
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium"
                      value={step.approverId}
                      onChange={(e) => handleStepChange(idx, e.target.value)}
                    >
                      <option value="">Select Manager / Approver</option>
                      {managers.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => handleRemoveStep(idx)} className="text-gray-400 hover:text-error bg-white rounded-lg p-2 border border-transparent hover:border-red-200 hover:shadow-sm transition-all">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {form.steps.length === 0 && (
                <div className="text-center p-6 bg-gray-50 rounded-xl border border-dashed border-border text-text-secondary text-sm font-medium">
                  No steps added. Click 'Add Step' to build the workflow constraint.
                </div>
              )}
            </div>
          </div>

          <hr className="border-border" />

          {/* Section 3: Conditional Rules */}
          <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100">
            <label className="block text-sm font-semibold text-text-primary mb-3">Early Resolution Rule (Optional)</label>
            <p className="text-xs text-text-secondary mb-4">Set a condition to automatically resolve the expense early without waiting for remaining steps.</p>
            
            <select
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium mb-4 shadow-sm"
              value={form.conditionType}
              onChange={(e) => setForm({...form, conditionType: e.target.value})}
            >
              <option value="none">Sequential (All steps must approve)</option>
              <option value="percentage">Percentage (If X% approve → auto approve)</option>
              <option value="specific">Specific Approver (If selected user approves → auto approve)</option>
              <option value="hybrid">Hybrid (Percentage OR Specific Approver)</option>
            </select>

            <div className="space-y-4">
              {(form.conditionType === 'percentage' || form.conditionType === 'hybrid') && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4 text-[#374151] pt-2 border-t border-blue-200">Required Approval Percentage (%)</label>
                  <Input 
                    type="number" 
                    min="1" 
                    max="100" 
                    placeholder="e.g. 60" 
                    value={form.percentageThreshold} 
                    onChange={e => setForm({...form, percentageThreshold: e.target.value})}
                    required
                    className="bg-white max-w-[200px]"
                  />
                </div>
              )}

              {(form.conditionType === 'specific' || form.conditionType === 'hybrid') && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4 text-[#374151] pt-2 border-t border-blue-200">Specific Magic Approver</label>
                  <select
                    required
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm font-medium"
                    value={form.autoApproverId}
                    onChange={(e) => setForm({...form, autoApproverId: e.target.value})}
                  >
                    <option value="">Select an Approver</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border mt-6">
            <Button type="button" variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button 
              type="submit" 
              className="bg-primary hover:bg-primary-hover shadow-sm"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              Save Chain
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
