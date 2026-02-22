// Shell-level types — only daemon/infrastructure types live here.
// All domain types (LLM, IRC, DevOps, etc.) belong in their respective plugin frontends.

// --- Health ---

export interface DaemonHealth {
	status: 'healthy' | 'starting' | 'unhealthy';
	ready: boolean;
	service: string;
	version: string;
	uptime_seconds: number;
	identity?: 'initialized' | 'not_initialized';
}

// --- Identity ---

export interface Identity {
	ok: boolean;
	identity?: {
		node_id: string;
		display_name?: string;
		realm?: string;
	};
	error?: string;
}

// --- UI State ---

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
