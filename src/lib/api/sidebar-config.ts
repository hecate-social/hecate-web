import { get, put } from '$lib/api';

export interface SidebarGroupConfig {
	name: string;
	icon: string;
	collapsed: boolean;
	apps: string[];
}

interface LauncherLayoutResponse {
	ok: boolean;
	groups: SidebarGroupConfig[];
}

export async function fetchSidebarConfig(): Promise<SidebarGroupConfig[]> {
	const resp = await get<LauncherLayoutResponse>('/api/launcher/layout');
	return resp.groups;
}

export async function saveSidebarConfig(groups: SidebarGroupConfig[]): Promise<void> {
	await put<{ ok: boolean }>('/api/launcher/layout', { groups });
}
