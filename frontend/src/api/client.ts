// frontend/src/api/client.ts

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  service: string;
  database?: 'connected' | 'unavailable';
}

/**
 * Checks the backend API service and database connectivity health status.
 * Uses the native Fetch API.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/health/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // A 503 status code is expected if the database is down, so we still parse its JSON.
  if (!response.ok && response.status !== 503) {
    throw new Error(`API health check failed with status: ${response.status}`);
  }

  return response.json();
}
