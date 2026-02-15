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

// Extract a human-readable error from a daemon response body
function parseErrorBody(text: string, fallback: string): { code: string | null; message: string } {
	try {
		const json = JSON.parse(text);
		if (json.error) {
			const code = String(json.error);
			return { code, message: humanizeError(code) };
		}
	} catch {
		// Not JSON — use as-is
	}
	return { code: null, message: text || fallback };
}

// Convert daemon error codes to friendly messages
function humanizeError(code: string): string {
	const map: Record<string, string> = {
		venture_not_initiated: 'Venture has not been initiated yet',
		venture_not_found: 'Venture not found',
		vision_not_refined: 'Vision has not been refined yet',
		vision_not_submitted: 'Vision has not been submitted yet',
		discovery_not_started: 'Discovery has not been started yet',
		discovery_not_active: 'Discovery is not currently active',
		discovery_already_started: 'Discovery has already been started',
		division_not_found: 'Division not found',
		phase_not_active: 'Phase is not currently active',
		phase_already_active: 'Phase is already active',
		phase_already_completed: 'Phase has already been completed',
		already_archived: 'Already archived',
		invalid_phase: 'Invalid phase code',
		missing_context_name: 'Context name is required',
		duplicate_context_name: 'A division with this name already exists',
		storm_not_started: 'Storm has not been started yet',
		storm_already_started: 'A storm is already in progress',
		storm_not_active: 'Storm is not currently active',
		storm_shelved: 'Storm is currently shelved',
		sticky_not_found: 'Sticky not found',
		stack_not_found: 'Stack not found',
		cluster_not_found: 'Cluster not found',
		arrow_not_found: 'Fact arrow not found',
		invalid_phase_transition: 'Invalid phase transition'
	};
	return map[code] || code.replace(/_/g, ' ');
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
