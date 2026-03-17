import type { ExecutionRecord } from '@shared/types';
import { apiFetch } from './client';
import type { PaginatedResponse, PaginationQuery } from './types';

export async function fetchExecutionsApi(): Promise<{ executions: ExecutionRecord[] }> {
  return apiFetch('/executions');
}

export async function fetchExecutionsPaginated(
  query: PaginationQuery = {},
): Promise<PaginatedResponse<ExecutionRecord>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? 20));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  return apiFetch(`/executions?${params.toString()}`);
}

export async function fetchExecutionDetail(id: string): Promise<ExecutionRecord> {
  return apiFetch(`/executions/${id}`);
}

export async function deleteExecutionApi(id: string): Promise<void> {
  return apiFetch(`/executions/${id}`, { method: 'DELETE' });
}

export async function clearExecutionsApi(): Promise<void> {
  return apiFetch('/executions', { method: 'DELETE' });
}
