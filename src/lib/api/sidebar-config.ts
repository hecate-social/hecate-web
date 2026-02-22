import { get, put } from '$lib/api';

export interface SidebarGroupConfig {
	name: string;
	icon: string;
	collapsed: boolean;
	apps: string[];
}

interface SidebarConfigResponse {
	ok: boolean;
	groups: SidebarGroupConfig[];
}

export async function fetchSidebarConfig(): Promise<SidebarGroupConfig[]> {
	const resp = await get<SidebarConfigResponse>('/api/config/sidebar');
	return resp.groups;
}

export async function saveSidebarConfig(groups: SidebarGroupConfig[]): Promise<void> {
	await put<{ ok: boolean }>('/api/config/sidebar', { groups });
}
