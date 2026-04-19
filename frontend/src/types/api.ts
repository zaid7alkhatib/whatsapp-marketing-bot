export interface ApiSuccessResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface HealthResponse {
  success: boolean;
  message?: string;
}
