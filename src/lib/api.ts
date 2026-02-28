// Daemon API client — proxied through Tauri's hecate:// custom protocol

import { get as getStore } from 'svelte/store';
import { settings } from '$lib/stores/settings';

const BASE = 'hecate://localhost';

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
	if (!resp.ok) {
		const text = await resp.text().catch(() => resp.statusText);
		const { code, message } = parseErrorBody(text, resp.statusText);
		throw new ApiError(resp.status, code, message);
	}
	return resp.json();
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
