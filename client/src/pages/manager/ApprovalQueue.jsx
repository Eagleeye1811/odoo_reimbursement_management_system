import React, { useState, useMemo, useCallback } from 'react';
import { useApprovalQueue, useApprovalStats, useApprovalHistory, useApprove, useReject, useApprovalDetail } from '../../hooks/useApprovals';
import { Table, TableHeader, TableRow, TableCell, TableHead } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { SkeletonRow } from '../../components/shared/SkeletonRow';
import { CurrencyDisplay } from '../../components/shared/CurrencyDisplay';
import { ApprovalChain } from '../../components/shared/ApprovalChain';
import { Search, CheckCircle, XCircle, CheckCircle2, Clock, CheckSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

const MetricCard = ({ title, value, sub, loading }) => (
  <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
    <p className="text-sm font-medium text-gray-500 mb-2">{title}</p>
    {loading ? (
      <div className="h-8 w-24 bg-gray-200 rounded animate-pulse mb-1"></div>
    ) : (
       <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
    )}
    <p className="text-sm text-gray-400 mt-2">{loading ? '...' : sub}</p>
  </div>
);

export const ApprovalQueue = () => {
  const { data: queue, isLoading: queueLoading } = useApprovalQueue();
  const { data: stats, isLoading: statsLoading } = useApprovalStats();
  const { data: completedHistory } = useApprovalHistory({ status: 'All', page: 1, limit: 10 });
  const { mutate: approveMutate, isPending: isApproving } = useApprove();
  const { mutate: rejectMutate, isPending: isRejecting } = useReject();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState(false);
  
  const [optimisticCompleted, setOptimisticCompleted] = useState([]);
  const [hiddenPendingIds, setHiddenPendingIds] = useState(new Set());
  const [activeMutations, setActiveMutations] = useState(new Set());

  const { data: detailData } = useApprovalDetail(expandedId);

  const formatBaseCurrency = useCallback((val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
  }, []);

  const filteredQueue = useMemo(() => {
    if (!queue) return [];
    let result = queue.filter(q => !hiddenPendingIds.has(q.approvalRequestId));
    
    if (search) {
      const lowerReq = search.toLowerCase();
      result = result.filter(q => 
        q.submitter.name.toLowerCase().includes(lowerReq) ||
        (q.expense.description && q.expense.description.toLowerCase().includes(lowerReq))
      );
    }
    if (category !== 'All') {
      result = result.filter(q => q.expense.category === category);
    }
    if (sort === 'newest') result.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === 'oldest') result.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sort === 'highest') result.sort((a,b) => b.expense.amountInBase - a.expense.amountInBase);
    if (sort === 'lowest') result.sort((a,b) => a.expense.amountInBase - b.expense.amountInBase);

    return result;
  }, [queue, search, category, sort, hiddenPendingIds]);

  const handleApprove = (id, e) => {
    e?.stopPropagation();
    setActiveMutations(prev => new Set(prev).add(id));
    approveMutate({ id, comment }, {
      onSuccess: () => {
        setExpandedId(null);
        setComment('');
        const item = queue.find(i => i.approvalRequestId === id);
        if (item) {
          setHiddenPendingIds(prev => new Set(prev).add(id));
          setOptimisticCompleted(prev => [{
             id: item.approvalRequestId,
             Subject: item.expense.description,
             Owner: item.submitter.name,
             Category: item.expense.category,
             Decision: 'approved',
             AmountINR: item.expense.amountInBase,
             DecidedAt: new Date().toISOString(),
             Comment: comment
          }, ...prev]);
        }
        setActiveMutations(prev => { const next = new Set(prev); next.delete(id); return next; });
      },
      onError: () => {
        alert("Failed to approve please try again");
        setActiveMutations(prev => { const next = new Set(prev); next.delete(id); return next; });
      }
    });
  };

  const handleReject = (id, e) => {
    e?.stopPropagation();
    if (!comment.trim()) {
      setCommentError(true);
      setTimeout(() => setCommentError(false), 800);
      return;
    }
    setActiveMutations(prev => new Set(prev).add(id));
    rejectMutate({ id, comment }, {
      onSuccess: () => {
        setExpandedId(null);
        setComment('');
        const item = queue.find(i => i.approvalRequestId === id);
        if (item) {
          setHiddenPendingIds(prev => new Set(prev).add(id));
          setOptimisticCompleted(prev => [{
             id: item.approvalRequestId,
             Subject: item.expense.description,
             Owner: item.submitter.name,
             Category: item.expense.category,
             Decision: 'rejected',
             AmountINR: item.expense.amountInBase,
             DecidedAt: new Date().toISOString(),
             Comment: comment
          }, ...prev]);
        }
        setActiveMutations(prev => { const next = new Set(prev); next.delete(id); return next; });
      },
      onError: () => {
        alert("Failed to reject please try again");
        setActiveMutations(prev => { const next = new Set(prev); next.delete(id); return next; });
      }
    });
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
    setComment('');
    setCommentError(false);
  };

  const completedRows = [...optimisticCompleted, ...(completedHistory?.data || [])].slice(0, 10);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Pending review" value={stats?.pendingCount || 0} sub={`${formatBaseCurrency(stats?.pendingTotalBase || 0)} total`} loading={statsLoading} />
        <MetricCard title="Approved today" value={stats?.approvedTodayCount || 0} sub={formatBaseCurrency(stats?.approvedTodayBase || 0)} loading={statsLoading} />
        <MetricCard title="Avg response" value={`${stats?.avgResponseHours || 0}h`} sub="Last 30 days" loading={statsLoading} />
        <MetricCard title="Approval rate" value={`${stats?.approvalRatePercent || 0}%`} sub="This month" loading={statsLoading} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row items-center gap-4 justify-between bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-500" /> Approvals to review
          </h2>
          <div className="flex gap-3 max-w-2xl w-full md:w-auto">
            <Input icon={Search} placeholder="Search employee or expense..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 w-full min-w-[200px]" />
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm max-w-[130px]" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="All">All Categories</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Accommodation">Accommodation</option>
              <option value="Misc">Misc</option>
            </select>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm max-w-[130px]" value={sort} onChange={e => setSort(e.target.value)}>
               <option value="newest">Newest first</option>
               <option value="oldest">Oldest first</option>
               <option value="highest">Highest Amount</option>
               <option value="lowest">Lowest Amount</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium w-[180px]">Approval subject</th>
                <th className="px-6 py-4 font-medium w-[220px]">Request owner</th>
                <th className="px-6 py-4 font-medium w-[140px]">Category</th>
                <th className="px-6 py-4 font-medium w-[120px]">Status</th>
                <th className="px-6 py-4 font-medium w-[180px]">Total amount</th>
                <th className="px-6 py-4 font-medium text-right w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {queueLoading && (
                <> <SkeletonRow cols={6} /> <SkeletonRow cols={6} /> <SkeletonRow cols={6} /> </>
              )}
              
              {!queueLoading && filteredQueue.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h3 className="text-gray-900 font-medium">All caught up!</h3>
                      <p className="text-sm text-gray-500">No pending approvals right now.</p>
                    </div>
                  </td>
                </tr>
              )}

              {filteredQueue.map((item) => {
                 const id = item.approvalRequestId;
                 const isExpanded = expandedId === id;
                 const mutPending = activeMutations.has(id);

                 return (
                   <React.Fragment key={id}>
                     <tr onClick={() => toggleExpand(id)} className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                       <td className="px-6 py-4 align-middle">
                         <span className="font-medium text-gray-900 truncate max-w-[150px] block" title={item.appliedRuleName || item.expense.description}>
                            {item.appliedRuleName || item.expense.description || "—"}
                         </span>
                       </td>
                       <td className="px-6 py-4 align-middle">
                         <div className="flex items-center gap-3">
                           <Avatar name={item.submitter.name} size="sm" fallback={item.submitter.avatarInitials} />
                           <span className="font-medium text-gray-900 truncate">{item.submitter.name}</span>
                         </div>
                       </td>
                       <td className="px-6 py-4 align-middle">
                         <span className="text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs">{item.expense.category}</span>
                       </td>
                       <td className="px-6 py-4 align-middle">
                         <Badge status="pending">Pending</Badge>
                       </td>
                       <td className="px-6 py-4 align-middle">
                         <CurrencyDisplay 
                           amountInBase={item.expense.amountInBase}
                           baseCurrencyCode={item.expense.baseCurrencyCode}
                           originalAmount={item.expense.amount}
                           originalCurrencyCode={item.expense.currencyCode}
                           exchangeRate={item.expense.exchangeRate}
                         />
                       </td>
                       <td className="px-6 py-4 align-middle text-right">
                         <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                           <Button size="icon" variant="ghost" disabled={mutPending} className="text-red-600 hover:bg-red-50 hover:border-red-200" onClick={(e) => handleReject(id, e)}>
                             {mutPending && isRejecting ? <span className="animate-spin text-red-500 rounded-full border-t-2 border-red-500 h-4 w-4"></span> : <XCircle className="h-5 w-5" />}
                           </Button>
                           <Button size="icon" variant="secondary" disabled={mutPending} className="bg-green-500 text-white hover:bg-green-600 border-transparent shadow-sm shadow-green-200" onClick={(e) => handleApprove(id, e)}>
                             {mutPending && isApproving ? <span className="animate-spin text-white rounded-full border-t-2 border-white h-4 w-4"></span> : <CheckCircle className="h-5 w-5" />}
                           </Button>
                         </div>
                       </td>
                     </tr>
                     {isExpanded && (
                       <tr className="bg-white border-b-2 border-gray-100">
                         <td colSpan={6} className="p-0">
                           <div className="grid grid-cols-1 md:grid-cols-5 gap-8 p-8 bg-gray-50/80 shadow-inner">
                             <div className="md:col-span-3 space-y-6">
                               <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Expense Details</h4>
                               <div className="bg-white border border-gray-200 rounded-xl p-5 grid grid-cols-2 gap-y-4 gap-x-6 shadow-sm">
                                 <div><label className="text-xs text-gray-500 font-medium block mb-0.5">Description</label><p className="text-sm font-medium text-gray-900">{item.expense.description}</p></div>
                                 <div><label className="text-xs text-gray-500 font-medium block mb-0.5">Expense Date</label><p className="text-sm font-medium text-gray-900">{new Date(item.expense.expenseDate).toLocaleDateString()}</p></div>
                                 <div><label className="text-xs text-gray-500 font-medium block mb-0.5">Category</label><p className="text-sm font-medium text-gray-900">{item.expense.category}</p></div>
                                 <div><label className="text-xs text-gray-500 font-medium block mb-0.5">Paid by</label><p className="text-sm font-medium text-gray-900">{item.submitter.name}</p></div>
                                 <div className="col-span-2 border-t border-gray-100 pt-4 mt-1 flex justify-between items-center">
                                   <div><label className="text-xs text-gray-500 font-medium block mb-0.5">Converted Amount ({item.expense.baseCurrencyCode})</label><p className="text-xl font-bold text-gray-900">{formatBaseCurrency(item.expense.amountInBase)}</p></div>
                                   <div className="text-right"><label className="text-xs text-gray-500 font-medium block mb-0.5">Original Submitted</label><p className="text-sm font-medium text-gray-700">{item.expense.amount} {item.expense.currencyCode}</p></div>
                                 </div>
                               </div>
                               {item.expense.receiptUrl && (
                                  <div>
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Receipt</h4>
                                    <a href={item.expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="block max-w-[200px] border border-gray-200 rounded-lg overflow-hidden relative group hover:shadow-md transition bg-white">
                                       <img src={item.expense.receiptUrl} alt="Receipt" loading="lazy" className="w-full h-32 object-cover" />
                                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white font-medium text-sm">Open Receipt</div>
                                    </a>
                                  </div>
                               )}
                               {detailData && detailData.fullChain && (
                                  <div>
                                     <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Approval Chain</h4>
                                     <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm"><ApprovalChain steps={detailData.fullChain} /></div>
                                  </div>
                               )}
                             </div>
                             <div className="md:col-span-2 flex flex-col pt-1">
                               <div className="sticky top-6 bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                                  <h4 className="text-lg font-bold text-gray-900 mb-4">Take Action</h4>
                                  <div className="space-y-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-700 block mb-1">Add a comment</label>
                                      <textarea 
                                        className={`w-full text-sm rounded-xl border ${commentError ? 'border-red-500 ring-2 ring-red-100 animate-shake' : 'border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'} bg-white px-4 py-3 min-h-[100px] outline-none transition-all placeholder:text-gray-400`}
                                        placeholder="Comment (required to reject)..." value={comment} onChange={e => {setComment(e.target.value); setCommentError(false);}}
                                      />
                                      {commentError && <p className="text-red-500 text-xs mt-1 font-medium">Comment is required to reject</p>}
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                       <Button className="flex-1 bg-white !text-red-600 border border-red-200 hover:bg-red-50" disabled={mutPending} onClick={() => handleReject(id)}>
                                          {mutPending && isRejecting ? '...' : 'Reject'}
                                       </Button>
                                       <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-200" disabled={mutPending} onClick={() => handleApprove(id)}>
                                          {mutPending && isApproving ? '...' : 'Approve'}
                                       </Button>
                                    </div>
                                  </div>
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
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Clock className="w-5 h-5 text-gray-400" /> Completed decisions</h2>
          <Link to="/app/approvals/history" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">View all history</Link>
        </div>
        <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
             <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider">
               <tr>
                 <th className="px-6 py-3 font-medium w-[200px]">Subject</th>
                 <th className="px-6 py-3 font-medium w-[150px]">Owner</th>
                 <th className="px-6 py-3 font-medium w-[120px]">Category</th>
                 <th className="px-6 py-3 font-medium w-[120px]">Decision</th>
                 <th className="px-6 py-3 font-medium w-[140px]">Amount</th>
                 <th className="px-6 py-3 font-medium w-[220px]">Comment</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100 text-sm">
                {completedRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No decisions yet.</td></tr>
                ) : (
                  completedRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                       <td className="px-6 py-3 text-gray-900 font-medium truncate" title={r.Subject}>{r.Subject}</td>
                       <td className="px-6 py-3">{r.Owner}</td>
                       <td className="px-6 py-3 text-gray-500">{r.Category}</td>
                       <td className="px-6 py-3"><Badge status={r.Decision === 'approved' ? 'approved' : 'rejected'}>{r.Decision}</Badge></td>
                       <td className="px-6 py-3 font-medium text-gray-900">₹{r.AmountINR}</td>
                       <td className="px-6 py-3 text-gray-500 truncate" title={r.Comment}>{r.Comment || '—'}</td>
                    </tr>
                  ))
                )}
             </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};
