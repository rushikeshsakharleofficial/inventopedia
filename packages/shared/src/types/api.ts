/** Standard API error response */
export interface ApiError {
  error: string;
  code: string;
  requestId: string;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/** Single item response wrapper */
export interface ApiResponse<T> {
  data: T;
  requestId: string;
}
