import React, { useState } from 'react';
import { useApprovalHistory } from '../../hooks/useApprovals';
import { Table, TableHeader, TableRow, TableCell, TableHead } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Download, Calendar } from 'lucide-react';

export const ApprovalHistory = () => {
  const [filters, setFilters] = useState({ status: 'All', dateFrom: '', dateTo: '', page: 1, limit: 10 });
  const { data, isLoading } = useApprovalHistory(filters);

  const statuses = ['All', 'approved', 'rejected'];

  const rows = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 10, totalPages: 1 };

  const handleExport = () => {
    if (!rows.length) return;
    const headers = ['Subject', 'Owner', 'Category', 'Decision', 'Amount (INR)', 'Decided At', 'Comment'];
    const csvRows = rows.map(r => [
      `"${r.Subject || ''}"`,
      `"${r.Owner || ''}"`,
      `"${r.Category || ''}"`,
      `"${r.Decision || ''}"`,
      r.AmountINR,
      `"${new Date(r.DecidedAt).toLocaleDateString()}"`,
      `"${r.Comment || ''}"`
    ]);
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approvals-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-gray-900">Approval History</h2>
        <Button onClick={handleExport} variant="secondary" disabled={!rows.length || isLoading}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-wrap">
        <Input 
          type="date"
          icon={Calendar}
          className="w-48"
          value={filters.dateFrom}
          onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value, page: 1 }))}
        />
        <span className="text-gray-400">to</span>
        <Input 
          type="date"
          icon={Calendar}
          className="w-48"
          value={filters.dateTo}
          onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value, page: 1 }))}
        />
        
        <div className="ml-auto flex gap-2">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setFilters(f => ({ ...f, status: s, page: 1 }))}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filters.status === s ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Amount (INR)</TableHead>
              <TableHead>Decided At</TableHead>
              <TableHead>Comment</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">Loading ...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">No decisions found.</TableCell></TableRow>
            ) : rows.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-gray-900 truncate max-w-[200px]" title={item.Subject}>{item.Subject}</TableCell>
                <TableCell>{item.Owner}</TableCell>
                <TableCell><span className="text-gray-500">{item.Category}</span></TableCell>
                <TableCell>
                  <Badge status={item.Decision === 'approved' ? 'approved' : 'rejected'}>{item.Decision}</Badge>
                </TableCell>
                <TableCell>₹{item.AmountINR}</TableCell>
                <TableCell>{new Date(item.DecidedAt).toLocaleDateString()}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={item.Comment}>{item.Comment}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
            <span className="text-sm text-gray-600">Showing page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={filters.page === 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={filters.page === meta.totalPages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
