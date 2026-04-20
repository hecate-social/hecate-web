// Daemon API client
//
// Inside Tauri (production): requests go to hecate://localhost (custom protocol → Unix socket)
// During vite dev: requests go same-origin (vite proxy → Unix socket)

import { get as getStore } from 'svelte/store';
import { settings } from '$lib/stores/settings';
import { isTauri } from '$lib/tauri';

// In dev mode, always use the Vite proxy (same-origin) even inside Tauri.
// The hecate:// custom protocol only works reliably in production builds.
const BASE = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';

function authHeaders(): Record<string, string> {
	const s = getStore(settings);
	const userId = s?.identity?.hecate_user_id;
	return userId ? { 'X-Hecate-User-Id': userId } : {};
}

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string | null,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

function parseErrorBody(text: string, fallback: string): { code: string | null; message: string } {
	try {
		const json = JSON.parse(text);
		if (json.error) {
			const code = String(json.error);
			return { code, message: code.replace(/_/g, ' ') };
		}
	} catch {
		// Not JSON — use as-is
	}
	return { code: null, message: text || fallback };
}

async function handleResponse<T>(resp: Response): Promise<T> {
	const text = await resp.text();
	if (!resp.ok) {
		const { code, message } = parseErrorBody(text, resp.statusText);
		throw new ApiError(resp.status, code, message);
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Invalid JSON from ${resp.url}: ${text.slice(0, 200)}`);
	}
}

export async function get<T>(path: string): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, { headers: authHeaders() });
	return handleResponse<T>(resp);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(body)
	});
	return handleResponse<T>(resp);
}

export async function put<T>(path: string, body: unknown): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(body)
	});
	return handleResponse<T>(resp);
}

export async function del<T>(path: string): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
	return handleResponse<T>(resp);
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(body)
	});
	return handleResponse<T>(resp);
}

export async function postFormData<T>(path: string, formData: FormData): Promise<T> {
	// Do NOT set Content-Type — the browser generates the correct
	// multipart boundary header automatically.
	const resp = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: authHeaders(),
		body: formData
	});
	return handleResponse<T>(resp);
}

export function contentUrl(path: string): string {
	// For <a href="…" download> or <img src="…">. Uses the same BASE
	// as the other helpers so it works in Tauri prod and Vite dev.
	return `${BASE}${path}`;
}
