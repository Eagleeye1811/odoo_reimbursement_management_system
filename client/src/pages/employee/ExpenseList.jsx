import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableHeader, TableRow, TableCell, TableHead } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Search, Plus, UploadCloud, RefreshCw, IndianRupee, Eye, Edit, Calendar, CheckCircle2, Clock, Check } from 'lucide-react';
import { getExpenses, createExpense, submitExpense, uploadReceipt, convertCurrency, getApprovalStatus } from '../../lib/expenseApi';

export const ExpenseList = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');

  // New Expense Modal State
  const [isNewExpenseModalOpen, setNewExpenseModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newExpenseForm, setNewExpenseForm] = useState({
    desc: '',
    date: '',
    category: 'Meals',
    amount: '',
    currency: 'INR',
    receiptUrl: '',
    vendor: ''
  });
  const [convertedAmountPreview, setConvertedAmountPreview] = useState('0.00');

  // Expense Detail Modal State
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [isDetailPanelOpen, setDetailPanelOpen] = useState(false);

  // --- API Hooks ---

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: getExpenses,
  });

  const { data: approvalTrail = [], isLoading: isLoadingTrail } = useQuery({
    queryKey: ['approvalStatus', selectedExpense?.id],
    queryFn: () => getApprovalStatus(selectedExpense.id),
    enabled: !!selectedExpense && selectedExpense.status !== 'DRAFT',
  });

  const uploadMutation = useMutation({
    mutationFn: uploadReceipt,
    onSuccess: (data) => {
      // data from backend OCR: { receiptUrl, amount, date, description, vendor, category }
      setNewExpenseForm({
        ...newExpenseForm,
        amount: data.amount ? data.amount.toString() : '',
        currency: data.currency || newExpenseForm.currency,
        date: data.date || '',
        desc: data.description || '',
        vendor: data.vendor || '',
        category: data.category || 'Miscellaneous',
        receiptUrl: data.receiptUrl,
      });
      setCurrentStep(2);
    },
    onError: (error) => {
      alert(error.response?.data?.error || 'Failed to process receipt.');
    }
  });

  const createExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries(['expenses']);
      setNewExpenseModalOpen(false);
    },
    onError: (error) => {
      alert(error.response?.data?.error || 'Failed to save expense');
    }
  });

  const submitExpenseMutation = useMutation({
    mutationFn: async (expenseData) => {
      // First create it as draft, then immediately submit it
      const created = await createExpense(expenseData);
      return submitExpense(created.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['expenses']);
      setNewExpenseModalOpen(false);
    },
    onError: (error) => {
      alert(error.response?.data?.error || 'Failed to submit claim');
    }
  });

  // Derived state
  const totalReimbursed = expenses.filter(e => e.status === 'APPROVED').reduce((acc, curr) => acc + parseFloat(curr.convertedAmount), 0);
  const pendingAmount = expenses.filter(e => e.status === 'WAITING_APPROVAL' || e.status === 'PENDING').reduce((acc, curr) => acc + parseFloat(curr.convertedAmount), 0);
  const draftsCount = expenses.filter(e => e.status === 'DRAFT').length;

  const filteredExpenses = expenses.filter(e => e.description?.toLowerCase().includes(searchQuery.toLowerCase()));

  // Handlers
  const handleOpenNewExpense = () => {
    setNewExpenseForm({ desc: '', date: '', category: 'Meals', amount: '', currency: 'INR', receiptUrl: '', vendor: '' });
    setCurrentStep(1);
    setConvertedAmountPreview('0.00');
    setNewExpenseModalOpen(true);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setNewExpenseForm(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    // Dynamic currency conversion preview
    const fetchConversion = async () => {
      if (newExpenseForm.amount && !isNaN(newExpenseForm.amount)) {
        if (newExpenseForm.currency === 'INR') {
          setConvertedAmountPreview(parseFloat(newExpenseForm.amount).toFixed(2));
        } else {
          try {
            const result = await convertCurrency(newExpenseForm.amount, newExpenseForm.currency, 'INR');
            setConvertedAmountPreview(result.convertedAmount.toFixed(2));
          } catch (err) {
            console.error('Failed to convert preview', err);
          }
        }
      } else {
        setConvertedAmountPreview('0.00');
      }
    };
    
    const timeoutId = setTimeout(fetchConversion, 500);
    return () => clearTimeout(timeoutId);
  }, [newExpenseForm.amount, newExpenseForm.currency]);

  const assemblePayload = () => ({
    description: newExpenseForm.desc,
    date: newExpenseForm.date,
    amount: parseFloat(newExpenseForm.amount),
    currency: newExpenseForm.currency,
    // Note: We need a category ID, you might need to fetch categories in real app, assuming UUIDs or names handled by backend mapping
    categoryId: "bb71fece-c01d-4033-9092-f38b2ced840a", // Hardcoded mock UUID to pass body validation for now to match backend
    vendor: newExpenseForm.vendor,
    receiptUrl: newExpenseForm.receiptUrl
  });

  const handleSaveDraft = () => {
    createExpenseMutation.mutate(assemblePayload());
  };

  const handleSubmitNewExpense = () => {
    submitExpenseMutation.mutate(assemblePayload());
  };

  const handleViewDetails = (exp) => {
    setSelectedExpense(exp);
    setDetailPanelOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-xl p-5 hover:shadow-soft transition-all">
          <h3 className="text-sm font-medium text-text-secondary mb-1">Total Reimbursed</h3>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-text-primary">
              ₹{totalReimbursed.toLocaleString()}
            </span>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Paid Out</span>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5 hover:shadow-soft transition-all">
          <h3 className="text-sm font-medium text-text-secondary mb-1">Pending Amount</h3>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-text-primary">
              ₹{pendingAmount.toLocaleString()}
            </span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">In Review</span>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5 hover:shadow-soft transition-all">
          <h3 className="text-sm font-medium text-text-secondary mb-1">Drafts</h3>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-text-primary">
              {draftsCount}
            </span>
            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">Action Needed</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Input 
          icon={Search} 
          placeholder="Search expenses..." 
          className="max-w-md" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Button onClick={handleOpenNewExpense}>
          <Plus className="h-4 w-4 mr-2" />
          New Expense
        </Button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {isLoadingExpenses ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading expenses...</TableCell></TableRow>
            ) : filteredExpenses.map((expense) => (
              <TableRow key={expense.id} className="group hover:bg-gray-50/50 transition-colors">
                <TableCell>
                  <span className="font-medium text-text-primary">{expense.description}</span>
                  {expense.vendor && <span className="block text-xs text-text-secondary">{expense.vendor}</span>}
                </TableCell>
                <TableCell>
                  <span className="text-text-secondary text-sm flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {new Date(expense.date).toLocaleDateString()}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-text-primary font-medium">₹{parseFloat(expense.convertedAmount).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
                    {expense.currency !== 'INR' && (
                      <span className="text-text-secondary text-xs">{parseFloat(expense.amount).toFixed(2)} {expense.currency}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge status={expense.status === 'WAITING_APPROVAL' ? 'Pending' : expense.status}>{expense.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      onClick={() => handleViewDetails(expense)}
                      aria-label="View Details"
                      className="px-2"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      disabled={expense.status !== 'DRAFT'}
                      aria-label="Edit Expense"
                      className="px-2 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoadingExpenses && filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-text-secondary">
                  No expenses found.
                </TableCell>
              </TableRow>
            )}
          </tbody>
        </Table>
      </div>

      {/* NEW EXPENSE MODAL */}
      <Modal isOpen={isNewExpenseModalOpen} onClose={() => setNewExpenseModalOpen(false)} title="New Expense" type="slide">
        <div className="flex flex-col h-full">
          {/* Steps Indicator */}
          <div className="flex items-center justify-between mb-8 px-4 relative">
            <div className={`flex flex-col items-center flex-1 ${currentStep >= 1 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 ${currentStep >= 1 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
              <span className="text-xs font-semibold">Upload</span>
            </div>
            <div className={`h-[2px] flex-1 bg-gray-200 ${currentStep >= 2 ? 'bg-primary' : ''}`}></div>
            <div className={`flex flex-col items-center flex-1 ${currentStep >= 2 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 ${currentStep >= 2 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
              <span className="text-xs font-semibold">Details</span>
            </div>
            <div className={`h-[2px] flex-1 bg-gray-200 ${currentStep >= 3 ? 'bg-primary' : ''}`}></div>
            <div className={`flex flex-col items-center flex-1 ${currentStep >= 3 ? 'text-primary' : 'text-gray-400'}`}>
               <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 ${currentStep >= 3 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>3</div>
              <span className="text-xs font-semibold">Review</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-1 py-2">
            {currentStep === 1 && (
              <div 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group h-full ${uploadMutation.isPending ? 'border-primary bg-primary-light/10' : 'border-border hover:border-primary/50 hover:bg-gray-50'}`}
                onClick={!uploadMutation.isPending ? triggerFileInput : undefined}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/png, image/jpeg, image/jpg" 
                  className="hidden" 
                />

                {!uploadMutation.isPending ? (
                  <>
                    <div className="h-16 w-16 rounded-full bg-primary-light text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                      <UploadCloud className="h-8 w-8" />
                    </div>
                    <h4 className="text-lg font-semibold text-text-primary mb-2">Upload Receipt</h4>
                    <p className="text-sm text-text-secondary mb-6">Drag and drop your receipt image here, or click to browse.</p>
                  </>
                ) : (
                  <>
                    <div className="relative h-16 w-16 mb-4 flex items-center justify-center">
                      <RefreshCw className="h-10 w-10 text-primary animate-spin" />
                      <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin-slow"></div>
                    </div>
                    <h4 className="text-lg font-semibold text-text-primary mb-2 animate-pulse">Running OCR Scan...</h4>
                    <p className="text-sm text-text-secondary">Extracting date, amount, and merchant info using Tesseract.</p>
                  </>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-5 animate-in slide-in-from-right-8 fade-in flex flex-col h-full">
                {newExpenseForm.receiptUrl && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">OCR Scan Complete</span>
                      We've auto-filled details from your receipt. Verify and correct below.
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Description</label>
                      <Input name="desc" value={newExpenseForm.desc} onChange={handleFormChange} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Vendor (Optional)</label>
                      <Input name="vendor" value={newExpenseForm.vendor} onChange={handleFormChange} />
                    </div>
                  </div>
                  
                  {newExpenseForm.receiptUrl && (
                     <div className="w-32 h-32 rounded-lg border border-gray-200 overflow-hidden shrink-0 mt-6 relative items-center justify-center group flex bg-gray-100">
                        <img src={newExpenseForm.receiptUrl} alt="Receipt" className="max-w-full max-h-full object-contain" />
                     </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="block text-sm font-medium text-text-primary mb-1.5">Date</label>
                     <Input name="date" type="date" value={newExpenseForm.date} onChange={handleFormChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Currency</label>
                    <select name="currency" value={newExpenseForm.currency} onChange={handleFormChange} className="w-full rounded-xl border border-border bg-surface px-4 py-2 outline-none focus:border-primary text-text-primary h-10 appearance-none">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-text-primary mb-1.5">Amount Spent</label>
                   <Input name="amount" placeholder="0.00" type="number" step="0.01" value={newExpenseForm.amount} onChange={handleFormChange} />
                </div>
                
                <div className="bg-surface border border-primary/20 rounded-xl p-4 flex items-center justify-between shadow-sm relative overflow-hidden mt-auto">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <div>
                    <span className="text-xs text-text-secondary font-medium uppercase block mb-1">Company Base</span>
                    <span className="text-sm font-semibold flex items-center gap-1.5 text-text-primary">
                      <IndianRupee className="h-4 w-4 text-primary" /> Converted Amount
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">₹{convertedAmountPreview}</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-8 fade-in">
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-text-primary mb-4 border-b border-gray-200 pb-2">Expense Summary</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Description</dt>
                      <dd className="font-medium text-text-primary text-right max-w-[200px] truncate">{newExpenseForm.desc}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Vendor</dt>
                      <dd className="font-medium text-text-primary">{newExpenseForm.vendor || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Date</dt>
                      <dd className="font-medium text-text-primary">{newExpenseForm.date}</dd>
                    </div>
                    <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center">
                      <dt className="font-semibold text-text-primary">Total Claim (INR)</dt>
                      <dd className="font-bold text-lg text-primary">₹{convertedAmountPreview}</dd>
                    </div>
                  </dl>
                </div>
                
                <div className="text-sm text-text-secondary flex items-start gap-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>By submitting this expense, you agree that it complies with the company's Reimbursement Policy.</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="pt-4 mt-6 border-t border-border flex justify-between gap-3 shrink-0">
            {currentStep === 1 ? (
              <>
                <Button variant="secondary" onClick={() => setNewExpenseModalOpen(false)}>Cancel</Button>
                <Button onClick={() => setCurrentStep(2)}>Input Manually</Button>
              </>
            ) : currentStep === 2 ? (
              <>
                <Button variant="secondary" onClick={() => setCurrentStep(1)}>Back</Button>
                <Button 
                  onClick={() => setCurrentStep(3)} 
                  disabled={!newExpenseForm.desc || !newExpenseForm.amount || !newExpenseForm.date}
                >
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setCurrentStep(2)}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-text-secondary bg-gray-100 hover:bg-gray-200" onClick={handleSaveDraft} disabled={createExpenseMutation.isPending}>
                    {createExpenseMutation.isPending ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button onClick={handleSubmitNewExpense} disabled={submitExpenseMutation.isPending}>
                    {submitExpenseMutation.isPending ? 'Submitting...' : 'Submit Claim'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* EXPENSE DETAIL SIDE PANEL */}
      <Modal isOpen={isDetailPanelOpen} onClose={() => setDetailPanelOpen(false)} title="Expense Details" type="slide" className="max-w-4xl">
        {selectedExpense && (
          <div className="h-full flex flex-col md:flex-row gap-6">
            <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-white border-b border-gray-200 text-sm font-semibold flex justify-between items-center">
                <span>Receipt Attachment</span>
                <Badge status={selectedExpense.status}>{selectedExpense.status}</Badge>
              </div>
              <div className="flex-1 p-4 flex items-center justify-center relative min-h-[300px]">
                {selectedExpense.receiptUrl ? (
                  <img src={selectedExpense.receiptUrl} alt="Receipt" className="max-w-full max-h-full object-contain drop-shadow-md rounded border border-gray-200 bg-white" />
                ) : (
                   <span className="text-gray-400">No receipt attached</span>
                )}
              </div>
            </div>

            <div className="w-full md:w-80 flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
              <div>
                <h3 className="font-semibold text-text-primary mb-3">Claim Information</h3>
                <div className="bg-surface border border-border rounded-xl p-4 space-y-3 text-sm">
                  <div>
                    <span className="block text-text-secondary text-xs mb-0.5">Description</span>
                    <span className="font-medium">{selectedExpense.description}</span>
                  </div>
                  <div>
                     <span className="block text-text-secondary text-xs mb-0.5">Vendor</span>
                     <span className="font-medium">{selectedExpense.vendor || '-'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-text-secondary text-xs mb-0.5">Date</span>
                      <span className="font-medium">{new Date(selectedExpense.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <span className="block text-text-secondary text-xs mb-0.5">Amount Claimed (Base)</span>
                    <span className="font-bold text-lg text-primary">₹{parseFloat(selectedExpense.convertedAmount).toLocaleString('en-IN')}</span>
                    {selectedExpense.currency !== 'INR' && (
                      <span className="text-xs text-text-secondary block mt-1">
                        Original: {parseFloat(selectedExpense.amount)} {selectedExpense.currency}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedExpense.status !== 'DRAFT' && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-3">Audit Trail</h3>
                  <div className="relative pl-6 space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-[2px] before:bg-gray-200">
                    {/* Submission Step */}
                    <div className="relative">
                      <div className="absolute -left-[30px] h-6 w-6 rounded-full flex items-center justify-center border-2 border-white bg-primary text-white">
                         <Check className="h-3 w-3" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">Submitted</h4>
                        <p className="text-xs text-text-secondary mt-0.5">{new Date(selectedExpense.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {isLoadingTrail ? (
                      <p className="text-sm text-gray-500">Loading trail...</p>
                    ) : approvalTrail.map((step, idx) => (
                      <div key={step.id} className="relative">
                        <div className={`absolute -left-[30px] h-6 w-6 rounded-full flex items-center justify-center border-2 border-white ${step.status === 'APPROVED' ? 'bg-green-500' : step.status === 'REJECTED' ? 'bg-red-500' : 'bg-gray-200'} text-white`}>
                          {step.status === 'PENDING' ? <Clock className="h-3 w-3" /> : step.status === 'APPROVED' ? <Check className="h-3 w-3" /> : '×'}
                        </div>
                        <div>
                          <h4 className={`text-sm font-semibold ${step.status === 'APPROVED' ? 'text-green-600' : step.status === 'REJECTED' ? 'text-red-600' : 'text-text-primary'}`}>
                            Step {idx + 1}: {step.status}
                          </h4>
                          <p className="text-xs text-text-secondary mt-0.5">
                            Approver: {step.approver ? step.approver.name : 'Unassigned'} 
                            {step.decidedAt && ` on ${new Date(step.decidedAt).toLocaleDateString()}`}
                          </p>
                          {step.comment && <p className="text-xs italic text-gray-500 mt-1">"{step.comment}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
