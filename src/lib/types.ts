// Daemon API types — matches hecate-daemon Erlang API responses

// --- Health ---

export interface DaemonHealth {
	status: 'healthy' | 'unhealthy';
	service: string;
	version: string;
	uptime_seconds: number;
	identity: 'initialized' | 'not_initialized';
}

// --- LLM ---

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
	role: Role;
	content: string;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolSchema {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	stream: boolean;
	temperature?: number;
	max_tokens?: number;
	tools?: ToolSchema[];
}

export interface ChatResponse {
	ok: boolean;
	response?: {
		role: Role;
		content: string;
		tool_calls?: ToolCall[];
	};
	error?: string;
}

export interface StreamChunk {
	content: string;
	done: boolean;
	model?: string;
	usage?: Usage;
	tool_use?: ToolCall;
	error?: string;
}

export interface Usage {
	prompt_tokens?: number;
	completion_tokens?: number;
}

export interface Model {
	name: string;
	provider: string;
	size?: string;
	size_bytes?: number;
	parameter_size?: string;
	family?: string;
	format?: string;
	context_length?: number;
	quantization_level?: string;
}

export interface ModelsResponse {
	ok: boolean;
	models: Model[];
}

export interface Provider {
	name: string;
	type: string;
	url?: string;
	enabled: boolean;
}

export interface ProvidersResponse {
	ok: boolean;
	providers: Provider[];
}

export interface LLMHealth {
	ok: boolean;
	status: 'healthy' | 'unhealthy';
	providers: Record<string, string>;
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

// --- Studio ---

export interface StudioDef {
	id: string;
	name: string;
	icon: string;
	path: string;
	builtin: boolean;
}

// --- DevOps: Ventures ---

export type PhaseCode = 'dna' | 'anp' | 'tni' | 'dno';

export interface Venture {
	venture_id: string;
	name: string;
	brief: string | null;
	status: number;
	status_label: string;
	repos: string[] | null;
	skills: string[] | null;
	context_map: Record<string, unknown> | null;
	initiated_at: number;
	initiated_by: string | null;
}

export interface Division {
	division_id: string;
	venture_id: string;
	context_name: string;
	overall_status: number;
	dna_status: number;
	anp_status: number;
	tni_status: number;
	dno_status: number;
	initiated_at: number;
	initiated_by: string | null;
}

// Venture status bit flags
export const VL_INITIATED = 1;
export const VL_VISION_REFINED = 2;
export const VL_SUBMITTED = 4;
export const VL_DISCOVERING = 8;
export const VL_DISCOVERY_PAUSED = 16;
export const VL_DISCOVERY_COMPLETED = 32;
export const VL_ARCHIVED = 64;
export const VL_STORMING = 128;
export const VL_STORM_SHELVED = 256;

// Division status bit flags
export const DA_INITIATED = 1;
export const DA_ARCHIVED = 2;

// Phase status bit flags
export const PHASE_ACTIVE = 1;
export const PHASE_PAUSED = 2;
export const PHASE_COMPLETED = 4;

// Event Storming types
export type StickyNoteType = 'event' | 'command' | 'aggregate' | 'read_model' | 'policy' | 'hotspot';

export interface StickyNote {
	id: string;
	type: StickyNoteType;
	text: string;
	aggregate_group?: string;
	author: string;
	created_at: number;
}

export type AgentPersona = 'oracle' | 'architect' | 'advocate' | 'scribe';

// --- Design-Level Event Storming (Command-Centric Cards) ---

export type ExecutionMode = 'human' | 'agent' | 'both';

export interface DeskCard {
	id: string;
	name: string;                 // desk/command name (snake_case)
	aggregate?: string;           // which aggregate this desk operates on
	execution: ExecutionMode;     // who executes: human, agent, or both
	policies: PolicyNote[];       // filter/guard policies (left side)
	events: EventNote[];          // emitted events (right side)
}

export interface PolicyNote {
	id: string;
	text: string;                 // the filter/guard condition
}

export interface EventNote {
	id: string;
	text: string;                 // event name (past tense, snake_case_v1)
}

// --- Big Picture Event Storming ---

export type BigPicturePhase =
	| 'ready'      // Before storm starts (UI-only, pre-daemon)
	| 'storm'      // High-octane event brainstorm (10 min timer is UI-only)
	| 'stack'      // Stack duplicate stickies together
	| 'groom'      // Pick canonical sticky from each stack
	| 'cluster'    // Group stickies into candidate divisions
	| 'name'       // Name each cluster as a bounded context
	| 'map'        // Draw integration fact arrows between clusters
	| 'promoted'   // Clusters promoted to divisions
	| 'shelved';   // Storm paused/shelved

export interface BigPictureEvent {
	sticky_id: string;
	text: string;
	author: string;       // 'user' or agent persona name
	weight: number;       // 1 by default, increases after grooming
	created_at: number;
	stack_id?: string;    // assigned during stacking
	cluster_id?: string;  // assigned during clustering
}

export interface EventCluster {
	cluster_id: string;
	name: string | null;  // set during naming phase
	color: string;        // visual identity
	status: string;       // 'active' | 'dissolved' | 'promoted'
	created_at: number;
}

export interface FactArrow {
	arrow_id: string;
	from_cluster: string; // cluster id (publishing division)
	to_cluster: string;   // cluster id (consuming division)
	fact_name: string;    // integration fact name
}

// Raw event from ReckonDB event stream
export interface RawEvent {
	event_type: string;
	data: Record<string, unknown>;
	version?: number;
	timestamp?: number;
}

// Storm state from daemon GET /storm/state
export interface StormState {
	phase: BigPicturePhase;
	storm_number: number;
	started_at: number | null;
	shelved_at: number | null;
	stickies: BigPictureEvent[];
	clusters: EventCluster[];
	arrows: FactArrow[];
}

export const CLUSTER_COLORS = [
	'#a78bfa', // violet
	'#60a5fa', // blue
	'#34d399', // emerald
	'#fbbf24', // amber
	'#f472b6', // pink
	'#fb923c', // orange
	'#38bdf8', // sky
	'#a3e635', // lime
	'#e879f9', // fuchsia
	'#f87171', // red
] as const;

// Helper functions
export function hasFlag(status: number, flag: number): boolean {
	return (status & flag) !== 0;
}

export function phaseStatus(division: Division, phase: PhaseCode): number {
	switch (phase) {
		case 'dna': return division.dna_status;
		case 'anp': return division.anp_status;
		case 'tni': return division.tni_status;
		case 'dno': return division.dno_status;
	}
}

export function phaseLabel(status: number): string {
	if (hasFlag(status, PHASE_COMPLETED)) return 'Completed';
	if (hasFlag(status, PHASE_PAUSED)) return 'Paused';
	if (hasFlag(status, PHASE_ACTIVE)) return 'Active';
	return 'Pending';
}

export function phaseStatusClass(status: number): string {
	if (hasFlag(status, PHASE_COMPLETED)) return 'text-health-ok';
	if (hasFlag(status, PHASE_PAUSED)) return 'text-health-warn';
	if (hasFlag(status, PHASE_ACTIVE)) return 'text-hecate-400';
	return 'text-surface-400';
}

// --- IRC ---

export interface IrcChannel {
	channel_id: string;
	name: string;
	topic: string | null;
	opened_by: string | null;
	status: number;
	status_label: string;
	opened_at: number;
}

// IRC channel status bit flags
export const IRC_INITIATED = 1;
export const IRC_ARCHIVED = 2;

export type IrcMessageType = 'message' | 'action' | 'system';

export interface IrcMessage {
	type: IrcMessageType;
	channel_id: string;
	nick: string;
	content: string;
	timestamp: number;
	/** Client-generated ID for optimistic dedup */
	clientId?: string;
}

export interface IrcPresence {
	type: 'presence';
	node_id: string;
	display_name: string;
	timestamp: number;
}

export interface IrcNickChange {
	type: 'nick_change';
	old_nick: string;
	new_nick: string;
}

export interface ChannelMember {
	node_id: string;
	nick: string;
	online: boolean;
}

export type IrcEvent =
	| IrcMessage
	| IrcPresence
	| IrcNickChange
	| { type: 'joined'; channel_id: string }
	| { type: 'parted'; channel_id: string }
	| { type: 'members_changed'; channel_id: string };

// --- UI State ---

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface AppState {
	connection: ConnectionStatus;
	health: DaemonHealth | null;
	llmHealth: LLMHealth | null;
	activeStudio: string;
}
