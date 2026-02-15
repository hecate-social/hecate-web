import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export interface RoleInfo {
	code: string;
	name: string;
	available: boolean;
}

export interface PersonalityInfo {
	agents_path: string | null;
	personality_loaded: boolean;
	alc_loaded: boolean;
	active_role: string | null;
	roles: RoleInfo[];
}

export const personalityInfo = writable<PersonalityInfo | null>(null);
export const activeRole = writable<string | null>(null);
export const systemPrompt = writable<string | null>(null);
export const personalityEnabled = writable(true);

export async function loadPersonalityInfo(): Promise<void> {
	try {
		const info = await invoke<PersonalityInfo>('get_personality_info');
		personalityInfo.set(info);

		// Default to 'dna' role if available
		if (!get(activeRole) && info.roles.some(r => r.code === 'dna' && r.available)) {
			activeRole.set('dna');
		}

		// Build system prompt
		await rebuildSystemPrompt();
	} catch (e) {
		console.warn('[personality] failed to load info:', e);
	}
}

export async function setRole(roleCode: string | null): Promise<void> {
	activeRole.set(roleCode);
	await rebuildSystemPrompt();
}

export async function rebuildSystemPrompt(): Promise<void> {
	if (!get(personalityEnabled)) {
		systemPrompt.set(null);
		return;
	}

	try {
		const role = get(activeRole);
		const prompt = await invoke<string>('build_system_prompt', { role });
		systemPrompt.set(prompt);
	} catch (e) {
		console.warn('[personality] failed to build system prompt:', e);
		systemPrompt.set(null);
	}
}

export function togglePersonality(): void {
	const current = get(personalityEnabled);
	personalityEnabled.set(!current);
	if (!current) {
		rebuildSystemPrompt();
	} else {
		systemPrompt.set(null);
	}
}
