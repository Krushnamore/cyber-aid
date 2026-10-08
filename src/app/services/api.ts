import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.isBrowser) throw new ApiError(0, 'API is only available in the browser');
    // The JWT lives in an HttpOnly cookie that the browser attaches automatically; this header is the CSRF guard.
    const headers: Record<string, string> = { 'X-Requested-With': 'cyberaid' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, 'Cannot reach the CyberAid server. Check your connection.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
    return data as T;
  }

  get = <T>(path: string) => this.request<T>('GET', path);
  post = <T>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {});
  delete = <T>(path: string) => this.request<T>('DELETE', path);
}
