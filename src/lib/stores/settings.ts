import { writable } from 'svelte/store';
import { get as apiGet, post, put } from '$lib/api';

export interface SettingsIdentity {
	node_id: string;
	hostname: string;
	linux_user: string;
	github_user: string | null;
	realm: string;
	paired: boolean;
}

export interface SettingsData {
	ok: boolean;
	identity: SettingsIdentity;
	preferences: Record<string, unknown>;
}

export const settings = writable<SettingsData | null>(null);
export const settingsLoading = writable(false);
export const settingsError = writable<string | null>(null);

export async function fetchSettings(): Promise<void> {
	settingsLoading.set(true);
	settingsError.set(null);
	try {
		const data = await apiGet<SettingsData>('/api/settings');
		settings.set(data);
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	} finally {
		settingsLoading.set(false);
	}
}

export async function pairNode(githubUser: string): Promise<void> {
	try {
		await post<{ ok: boolean }>('/api/settings/pair', { github_user: githubUser });
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}

export async function unpairNode(): Promise<void> {
	try {
		await post<{ ok: boolean }>('/api/settings/unpair', {});
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}

export interface PairingSession {
	confirm_code: string;
	confirm_url: string;
	session_id: string;
}

export interface PairingStatus {
	status: 'pending' | 'confirmed' | 'expired';
}

export async function initiatePairing(): Promise<PairingSession> {
	const data = await post<PairingSession>('/api/settings/pair/initiate', {});
	return data;
}

export async function checkPairingStatus(): Promise<PairingStatus> {
	const data = await apiGet<PairingStatus>('/api/settings/pair/status');
	return data;
}

export async function updatePreferences(prefs: Record<string, unknown>): Promise<void> {
	try {
		await put<{ ok: boolean }>('/api/settings/preferences', prefs);
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}
