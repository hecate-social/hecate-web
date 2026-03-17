// Shell-level types — only daemon/infrastructure types live here.
// All domain types (LLM, IRC, DevOps, etc.) belong in their respective plugin frontends.

// --- Health ---

export interface BootStatus {
	boot_phase: 'booting_stores' | 'starting_subscriptions' | 'replaying' | 'running' | 'initializing';
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
	uptime_seconds: number;
	identity?: 'initialized' | 'not_initialized';
	boot?: BootStatus;
}

// --- UI State ---

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
