import React, { useState, useEffect } from 'react';
import { Table, TableHeader, TableRow, TableCell, TableHead } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Search, Filter, MessageSquare, FileText } from 'lucide-react';
import { getManagerApprovals, approveManagerExpense, rejectManagerExpense } from '../../lib/expenseApi';

export const ApprovalQueue = () => {
  const [expandedId, setExpandedId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const data = await getManagerApprovals();
        setItems(data);
      } catch (err) {
        console.error('Failed to load approvals:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchApprovals();
  }, []);

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') {
        await approveManagerExpense(id, 'Approved');
      } else {
        await rejectManagerExpense(id, 'Rejected');
      }
      setItems(items.map(item => 
        item.id === id ? { ...item, status: action === 'approve' ? 'APPROVED' : 'REJECTED' } : item
      ));
      setExpandedId(null);
    } catch (err) {
      console.error('Failed to action expense:', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-text-secondary">Loading approvals...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 max-w-md w-full">
          <Input icon={Search} placeholder="Search employee or category..." className="w-[300px]" />
          <Button variant="secondary" className="px-3">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl overflow-hidden border border-border">
        <h3 className="text-lg font-semibold text-text-primary px-6 py-4 border-b border-border">
          Approvals to review
        </h3>
        <Table>
          <TableHeader>
            <TableRow className="bg-background">
              <TableHead>Approval Subject</TableHead>
              <TableHead>Request Owner</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Request Status</TableHead>
              <TableHead>Total amount (in company's currency)</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-text-secondary italic">
                  No approvals pending
                </TableCell>
              </TableRow>
            ) : items.map((item) => {
              const symbol = item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : item.currency === 'GBP' ? '£' : item.currency;
              const isReadOnly = item.status !== 'PENDING';
              return (
                <React.Fragment key={item.id}>
                  <TableRow 
                    expandable 
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className={isReadOnly ? 'opacity-70 pointer-events-none' : ''}
                  >
                    <TableCell>
                      <span className="font-medium text-text-primary">{item.description || 'none'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar name={item.employeeName} size="sm" />
                        <span className="font-medium text-text-primary">{item.employeeName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">{item.category}</span>
                    </TableCell>
                    <TableCell>
                      <Badge status={item.status === 'APPROVED' ? 'approved' : item.status === 'REJECTED' ? 'rejected' : 'pending'}>
                        {item.status || 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-error font-medium">
                          {item.amount} {symbol} (in {item.companyCurrency})
                        </span>
                        <span className="text-text-primary font-bold">
                          = {item.convertedAmount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isReadOnly && (
                        <div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}>
                           <Button 
                             onClick={() => handleAction(item.id, 'approve')}
                             className="bg-transparent border border-success text-success hover:bg-success hover:text-white px-5 py-1.5 h-auto text-sm rounded-full transition-colors"
                           >
                             Approve
                           </Button>
                           <Button 
                             onClick={() => handleAction(item.id, 'reject')}
                             className="bg-transparent border border-error text-error hover:bg-error hover:text-white px-5 py-1.5 h-auto text-sm rounded-full transition-colors"
                           >
                             Reject
                           </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {expandedId === item.id && (
                    <tr className="bg-background border-b border-border">
                      <td colSpan={6} className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-3">Expense Details</h4>
                            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-text-secondary">Date</span>
                                <span className="font-medium text-text-primary">
                                  {new Date(item.date).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-text-secondary">Receipt</span>
                                {item.receiptUrl ? (
                                  <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline">
                                    <FileText className="h-4 w-4 mr-1" /> View Receipt
                                  </a>
                                ) : (
                                  <span className="text-text-secondary italic">No receipt attached</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-text-primary mb-3">Quick Action</h4>
                            <div>
                               <Input placeholder="Add a comment before actioning..." icon={MessageSquare} />
                            </div>
                            <div className="text-xs text-text-secondary mt-2">
                              Once the expense is approved/rejected by manager that record becomes readonly, the status is set in request status field and the buttons become invisible.
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
};
