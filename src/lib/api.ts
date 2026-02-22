// Daemon API client — proxied through Tauri's hecate:// custom protocol

const BASE = 'hecate://localhost';

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
	const resp = await fetch(`${BASE}${path}`);
	return handleResponse<T>(resp);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return handleResponse<T>(resp);
}

export async function del<T>(path: string): Promise<T> {
	const resp = await fetch(`${BASE}${path}`, { method: 'DELETE' });
	return handleResponse<T>(resp);
}
