// Observer: Supervision tree navigation

import { get } from '$lib/api';

export interface SupervisionNode {
	id: string;
	pid: string | null;
	type: string;
	status: string;
	children: SupervisionNode[];
}

export interface SupChild {
	id: string;
	pid: string | null;
	type: string;
	status: string;
	child_count: number;
	app?: string;
}

export async function fetchSupervisionTree(root = 'hecate_sup') {
	return get<{ ok: boolean; tree: SupervisionNode }>(`/api/observer/supervision?root=${root}`);
}

export async function fetchSupervisionRoots() {
	return get<{ items: SupChild[]; total: number }>('/api/observer/supervision/roots');
}

export async function fetchSupervisionChildren(pidOrName: string) {
	const param = pidOrName.includes('.') ? `pid=${pidOrName}` : `name=${pidOrName}`;
	return get<{ items: SupChild[]; total: number; type?: string; info?: Record<string, unknown> }>(
		`/api/observer/supervision/children?${param}`
	);
}
