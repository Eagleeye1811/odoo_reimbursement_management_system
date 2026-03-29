import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IndianRupee, PieChart, TrendingUp, CheckCircle2, Clock, Search, Filter } from 'lucide-react';
import { Table, TableHeader, TableRow, TableCell, TableHead } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import api from '../../lib/axios';

export const AllExpensesPage = () => {
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [filters, setFilters] = useState({ status: '', category: '' });
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['admin-expenses', filters.status, filters.category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.category) params.append('category', filters.category);
      const { data } = await api.get(`/admin/expenses?${params.toString()}`);
      return data;
    }
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ id, action, comment }) => {
      await api.post(`/admin/expenses/${id}/override`, { action, comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-stats']); // Invalidate other stats if active
      queryClient.invalidateQueries(['admin-expenses']);
      setSelectedExpense(null);
      setComment('');
    }
  });

  const handleOverride = (action) => {
    if (!selectedExpense) return;
    if (action === 'reject' && !comment) {
      alert('Please provide a comment for rejection.');
      return;
    }
    if (window.confirm(`Are you sure you want to FORCE ${action.toUpperCase()} this expense?`)) {
      overrideMutation.mutate({ id: selectedExpense.id, action, comment });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      <div className="flex items-center justify-between mb-4">
        <div>
           <h2 className="text-2xl font-bold tracking-tight text-text-primary">All Company Expenses</h2>
           <p className="text-text-secondary">View and manage all employee expense requests globally.</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all w-full md:w-auto"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all w-full md:w-auto"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Supplies">Supplies</option>
              <option value="Software">Software</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {expenses.map((expense) => (
                <TableRow 
                  key={expense.id} 
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedExpense(expense)}
                >
                  <TableCell>
                    <span className="font-semibold text-text-primary">{expense.employee_name}</span>
                  </TableCell>
                  <TableCell>{expense.category}</TableCell>
                  <TableCell className="font-medium">{expense.currency} {parseFloat(expense.amount).toFixed(2)}</TableCell>
                  <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className="text-sm text-text-secondary">
                      {expense.status === 'pending' ? `Step ${expense.current_step_index || 1}` : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge status={expense.status}>{expense.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && !expensesLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-text-secondary">
                    No expenses found matching filters
                  </TableCell>
                </TableRow>
              )}
              {expensesLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-text-secondary">
                    Loading expenses...
                  </TableCell>
                </TableRow>
              )}
            </tbody>
          </Table>
        </div>
      </div>

      <Modal isOpen={!!selectedExpense} onClose={() => setSelectedExpense(null)} title="Expense Details">
        {selectedExpense && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
              <div>
                <p className="text-sm text-text-secondary">Employee</p>
                <p className="font-semibold">{selectedExpense.employee_name}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Amount</p>
                <p className="font-semibold text-lg">{selectedExpense.currency} {parseFloat(selectedExpense.amount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Date</p>
                <p className="font-medium">{new Date(selectedExpense.expense_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Category</p>
                <p className="font-medium">{selectedExpense.category}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-text-secondary mb-1">Description</p>
              <p className="text-text-primary bg-white border border-border p-3 rounded-lg">
                {selectedExpense.description || 'No description provided.'}
              </p>
            </div>

            {selectedExpense.status === 'pending' && (
              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-bold text-text-primary mb-3 uppercase tracking-wider">Admin Override (Danger Zone)</h4>
                
                <textarea
                  className="w-full bg-white border border-border rounded-xl p-3 text-sm focus:ring-primary outline-none mb-3"
                  placeholder="Reason for overriding (required for rejection)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />

                <div className="flex gap-3">
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
                    onClick={() => handleOverride('approve')}
                    isLoading={overrideMutation.isPending}
                  >
                    Force Approve
                  </Button>
                  <Button 
                    variant="secondary"
                    className="flex-1 bg-red-50 text-error border-red-200 hover:bg-red-100" 
                    onClick={() => handleOverride('reject')}
                    isLoading={overrideMutation.isPending}
                  >
                    Force Reject
                  </Button>
                </div>
              </div>
            )}
            {selectedExpense.status !== 'pending' && (
              <div className="pt-4 border-t border-border text-center">
                <Badge status={selectedExpense.status} className="text-base px-3 py-1">
                  Already {selectedExpense.status}
                </Badge>
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
};
