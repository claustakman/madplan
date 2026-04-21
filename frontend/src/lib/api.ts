const BASE_URL = import.meta.env.PROD
  ? 'https://madplan-worker.claus-takman.workers.dev'
  : '';

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('madplan_token');
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ukendt fejl' })) as { error: string };
    throw new Error(err.error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ukendt fejl' })) as { error: string };
    throw new Error(err.error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
}

export async function apiUploadImage<T>(path: string, file: File): Promise<T> {
  const token = localStorage.getItem('madplan_token');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ukendt fejl' })) as { error: string };
    throw new Error(err.error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}
