// Observer: Process list + detail

import { get } from '$lib/api';

export interface ProcessInfo {
	pid: string;
	registered_name: string | null;
	initial_call: string | null;
	current_function: string | null;
	memory: number;
	reductions: number;
	message_queue_len: number;
	status: string;
}

export interface ProcessDetail extends ProcessInfo {
	links: string[];
	monitors: Array<{ type: string; target: string }>;
	trap_exit: boolean;
	heap_size: number;
	stack_size: number;
	total_heap_size: number;
	dictionary: Array<{ key: string; value: string }>;
	dictionary_size: number;
	garbage_collection: { minor_gcs: number; fullsweep_after: number };
	current_stacktrace: Array<{ module: string; function: string; arity: number; file?: string; line?: number }>;
}

export interface ProcessStateInfo {
	gen_state?: unknown;
	gen_type?: string | null;
	messages?: Array<{ type: string; data: unknown }>;
	messages_count?: number;
	messages_truncated?: boolean;
	sys_module?: string | null;
	sys_status?: unknown;
}

export async function fetchProcesses(sort = 'memory', limit = 50, offset = 0) {
	return get<{ items: ProcessInfo[]; total: number; limit: number; offset: number }>(
		`/api/observer/processes?sort=${sort}&limit=${limit}&offset=${offset}`
	);
}

export async function fetchProcessDetail(pid: string, include?: string[]) {
	const params = include?.length ? `?include=${include.join(',')}` : '';
	return get<{ ok: boolean } & ProcessDetail & ProcessStateInfo>(`/api/observer/processes/${pid}${params}`);
}
