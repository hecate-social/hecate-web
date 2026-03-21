// Observer: Loaded plugins

import { get } from '$lib/api';

export interface PluginInfo {
	name: string;
	version: string | null;
	callback_module: string | null;
	store_id: string | null;
	has_frontend: boolean;
	health: string;
	loaded_at: number | null;
}

export async function fetchPlugins() {
	return get<{ items: PluginInfo[]; total: number }>('/api/observer/plugins');
}
