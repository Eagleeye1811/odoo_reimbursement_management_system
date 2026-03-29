import api from './api';

export const getExpenses = async () => {
  const { data } = await api.get('/expenses');
  return data.data; // Server returns { success, data, message }
};

export const createExpense = async (expenseData) => {
  const { data } = await api.post('/expenses', expenseData);
  return data.data;
};

export const getExpenseDetails = async (id) => {
  const { data } = await api.get(`/expenses/${id}`);
  return data.data;
};

export const uploadReceipt = async (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  
  const { data } = await api.post('/expenses/receipt/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data; // { receiptUrl, amount, date, description, vendor, category }
};

export const submitExpense = async (id) => {
  const { data } = await api.patch(`/expenses/${id}/submit`);
  return data.data;
};

export const deleteExpense = async (id) => {
  const { data } = await api.delete(`/expenses/${id}`);
  return data.data;
};

export const getApprovalStatus = async (id) => {
  const { data } = await api.get(`/expenses/${id}/approval-status`);
  return data.data; // Array of approval steps
};

export const convertCurrency = async (amount, from, to) => {
  const { data } = await api.get('/currencies/convert', { params: { amount, from, to } });
  return data.data; // { convertedAmount, rate, ... }
};
