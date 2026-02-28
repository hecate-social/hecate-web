import { writable } from 'svelte/store';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { get as apiGet, post, put } from '$lib/api';

export interface SettingsIdentity {
	hecate_user_id: string;
	linux_user: string;
	hostname: string;
	initiated_at: number | null;
	status: number;
}

export interface RealmMembership {
	membership_id: string;
	realm_id: string;
	realm_url: string;
	oauth_account: string;
	oauth_provider: string;
	confirmed_at: number;
}

export interface SettingsData {
	ok: boolean;
	identity: SettingsIdentity;
	preferences: Record<string, unknown>;
	realms: RealmMembership[];
}

export interface RealmJoinSession {
	session_id: string;
	joining_url: string;
	expires_in: number;
}

export interface RealmJoinStatus {
	ok: boolean;
	status: 'idle' | 'joining' | 'joined' | 'failed';
	session_id?: string;
	expires_in?: number;
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

export async function initiateRealmJoin(realmUrl?: string): Promise<RealmJoinSession> {
	const data = await post<{ ok: boolean } & RealmJoinSession>('/api/realms/join/initiate', {
		realm_url: realmUrl ?? 'https://macula.io'
	});
	return data;
}

export async function checkRealmJoinStatus(): Promise<RealmJoinStatus> {
	const data = await apiGet<RealmJoinStatus>('/api/realms/join/status');
	return data;
}

export async function cancelRealmJoin(): Promise<void> {
	await post<{ ok: boolean }>('/api/realms/join/cancel', {});
}

export async function leaveRealm(membershipId: string): Promise<void> {
	try {
		await post<{ ok: boolean }>(`/api/realms/${membershipId}/leave`, {});
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}

export async function updatePreferences(prefs: Record<string, unknown>): Promise<void> {
	try {
		await put<{ ok: boolean }>('/api/settings/preferences', prefs);
		await fetchSettings();
	} catch (e) {
		settingsError.set(e instanceof Error ? e.message : String(e));
	}
}

let settingsUnlisten: UnlistenFn | null = null;

export async function startSettingsWatcher(): Promise<void> {
	if (settingsUnlisten) return;
	settingsUnlisten = await listen('daemon-settings-changed', () => {
		fetchSettings();
	});
}

export function stopSettingsWatcher(): void {
	if (settingsUnlisten) {
		settingsUnlisten();
		settingsUnlisten = null;
	}
}
