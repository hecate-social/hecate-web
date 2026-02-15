import { writable } from 'svelte/store';
import type { Identity, Provider } from '../types.js';
import * as api from '../api.js';

export const identity = writable<Identity | null>(null);
export const providers = writable<Provider[]>([]);

export async function fetchIdentity(): Promise<void> {
	try {
		const resp = await api.get<Identity>('/api/identity');
		identity.set(resp);
	} catch {
		identity.set(null);
	}
}

export async function fetchProviders(): Promise<void> {
	try {
		const resp = await api.get<{ ok: boolean; providers: Provider[] }>('/api/llm/providers');
		if (resp.ok && resp.providers) {
			providers.set(resp.providers);
		}
	} catch {
		providers.set([]);
	}
}
