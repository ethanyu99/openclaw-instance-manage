export interface PaginationParams {
  page: number;      // 1-based
  limit: number;     // items per page, default 20, max 100
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function parsePagination(query: Record<string, any>): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  return { page, limit, sortBy: query.sortBy, sortOrder };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
      hasMore: params.page * params.limit < total,
    },
  };
}
