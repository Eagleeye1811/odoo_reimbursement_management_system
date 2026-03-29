import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// Create an API instance or use a central one if available. Standardizing to assume it returns {data}.
// Assuming the user has configured global axios or a central api instance, we'll just use raw axios mapped to relative '/api' here.
// Or we can create a basic wrapper
const api = axios.create({ baseURL: 'http://localhost:5000/api', withCredentials: true });

export const useApprovalQueue = () => {
  return useQuery({
    queryKey: ['approvals', 'queue'],
    queryFn: () => api.get('/approvals/queue').then(r => r.data),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false
  });
};

export const useApprovalStats = () => {
  return useQuery({
    queryKey: ['approvals', 'stats'],
    queryFn: () => api.get('/approvals/queue/stats').then(r => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000
  });
};

export const useApprovalHistory = (filters) => {
  return useQuery({
    queryKey: ['approvals', 'history', filters],
    queryFn: () => api.get('/approvals/history', { params: filters }).then(r => r.data),
    keepPreviousData: true
  });
};

export const useTeamExpenses = (filters) => {
  return useQuery({
    queryKey: ['approvals', 'team-expenses', filters],
    queryFn: () => api.get('/approvals/team-expenses', { params: filters }).then(r => r.data),
    keepPreviousData: true
  });
};

export const useApprovalDetail = (id) => {
  return useQuery({
    queryKey: ['approvals', 'detail', id],
    queryFn: () => api.get(`/approvals/${id}`).then(r => r.data),
    enabled: !!id
  });
};

export const useApprove = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }) => api.post(`/approvals/${id}/approve`, { comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['approvals', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['approvals', 'history'] });
    }
  });
};

export const useReject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }) => api.post(`/approvals/${id}/reject`, { comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['approvals', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['approvals', 'history'] });
    }
  });
};
