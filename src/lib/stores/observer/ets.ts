// Observer: ETS tables + content

import { get } from '$lib/api';

export interface EtsTable {
	name: string;
	id: string;
	type: string;
	size: number;
	memory_bytes: number;
	owner: string | null;
	protection: string;
	read_concurrency: boolean;
	write_concurrency: boolean;
	named_table: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TermValue = any;

export interface EtsRow {
	key: TermValue;
	values: TermValue[];
}

export async function fetchEtsTables() {
	return get<{ items: EtsTable[]; total: number }>('/api/observer/ets');
}

export async function fetchEtsTableContent(name: string, limit = 50, offset = 0) {
	return get<{
		items: EtsRow[];
		total: number;
		limit: number;
		offset: number;
		table: { name: string; type: string; size: number; protection: string };
	}>(`/api/observer/ets/${name}?limit=${limit}&offset=${offset}`);
}
