import { writable } from 'svelte/store';
import { get as apiGet, post, put } from '$lib/api';

export interface SettingsIdentity {
	hecate_user_id: string;
	linux_user: string;
	hostname: string;
	github_user: string | null;
	realm: string | null;
	paired: boolean;
	paired_at: number | null;
	initiated_at: number | null;
	status: number;
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

export async function unpairNode(): Promise<void> {
	try {
		await post<{ ok: boolean }>('/api/settings/unpair', {});
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}

export interface PairingSession {
	session_id: string;
	confirm_code: string;
	pairing_url: string;
	expires_in: number;
}

export interface PairingStatus {
	ok: boolean;
	status: 'idle' | 'pairing' | 'paired' | 'failed';
	confirm_code?: string;
	session_id?: string;
	expires_in?: number;
}

export async function initiatePairing(): Promise<PairingSession> {
	const data = await post<{ ok: boolean } & PairingSession>('/api/pairing/initiate', {});
	return data;
}

export async function checkPairingStatus(): Promise<PairingStatus> {
	const data = await apiGet<PairingStatus>('/api/pairing/status');
	return data;
}

export async function cancelPairing(): Promise<void> {
	await post<{ ok: boolean }>('/api/pairing/cancel', {});
}

export async function updatePreferences(prefs: Record<string, unknown>): Promise<void> {
	try {
		await put<{ ok: boolean }>('/api/settings/preferences', prefs);
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}
