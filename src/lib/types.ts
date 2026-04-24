// Shell-level types — only daemon/infrastructure types live here.
// All domain types (LLM, IRC, DevOps, etc.) belong in their respective plugin frontends.

// --- Health ---

export interface BootStatus {
	boot_phase:
		| 'initializing'
		| 'waiting_registration'
		| 'booting_stores'
		| 'starting_subscriptions'
		| 'replaying'
		| 'probing_mesh'
		| 'running';
	stores: Record<string, 'ready' | 'starting'>;
	stores_ready: number;
	stores_total: number;
	elapsed_ms: number;
}

export interface DaemonHealth {
	status: 'healthy' | 'starting' | 'unhealthy';
	ready: boolean;
	service: string;
	version: string;
	node_name: string;
	uptime_seconds: number;
	identity?: 'initialized' | 'not_initialized';
	boot?: BootStatus;
	viewstate?: import('$lib/viewstate').Viewstate;
}

// --- UI State ---

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
