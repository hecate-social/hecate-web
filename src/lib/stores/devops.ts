import { writable, derived, get } from 'svelte/store';
import * as api from '../api.js';
import type {
	Venture,
	Division,
	PhaseCode,
	StickyNote,
	StickyNoteType,
	Model,
	BigPictureEvent,
	BigPicturePhase,
	EventCluster,
	FactArrow,
	DeskCard,
	ExecutionMode,
	PolicyNote,
	EventNote,
	StormState,
	RawEvent
} from '../types.js';
import { models, selectedModel } from './llm.js';

// --- State ---
export const ventures = writable<Venture[]>([]);
export const activeVenture = writable<Venture | null>(null);
export const divisions = writable<Division[]>([]);
export const selectedDivisionId = writable<string | null>(null);
export const selectedPhase = writable<PhaseCode>('dna');
export const isLoading = writable(false);
export const devopsError = writable<string | null>(null);
export const showAIAssist = writable(false);
export const aiAssistContext = writable<string>('');
export const aiAssistAgent = writable<string | null>(null);

// Event storming notes (client-side, per-division)
export const stickyNotes = writable<StickyNote[]>([]);

// --- Phase-Aware Model Selection ---

const PHASE_MODEL_PREFS_KEY = 'hecate-devops-phase-models';

type PhaseModelPrefs = Record<PhaseCode, string | null>;

function loadPhaseModelPrefs(): PhaseModelPrefs {
	try {
		const raw = localStorage.getItem(PHASE_MODEL_PREFS_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		// ignore
	}
	return { dna: null, anp: null, tni: null, dno: null };
}

function savePhaseModelPrefs(prefs: PhaseModelPrefs): void {
	try {
		localStorage.setItem(PHASE_MODEL_PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// ignore
	}
}

export const phaseModelPrefs = writable<PhaseModelPrefs>(loadPhaseModelPrefs());

// The model override for the AI Assist panel (null = use auto-selection)
export const aiModelOverride = writable<string | null>(null);

// Model classification heuristic
const CODE_PATTERNS = [
	/code/i,
	/coder/i,
	/codestral/i,
	/starcoder/i,
	/codellama/i,
	/wizard-?coder/i,
	/deepseek-coder/i
];

export function modelAffinity(name: string): 'code' | 'general' {
	if (CODE_PATTERNS.some((p) => p.test(name))) return 'code';
	return 'general';
}

// Phase affinity: which type of model works best
export function phaseAffinity(phase: PhaseCode): 'code' | 'general' {
	return phase === 'tni' ? 'code' : 'general';
}

// Recommend a model for a phase given available models
// Prefer local (Ollama) models — they're self-hosted and always available
export function recommendModel(
	phase: PhaseCode,
	available: Model[]
): string | null {
	if (available.length === 0) return null;
	const affinity = phaseAffinity(phase);
	const local = available.filter((m) => m.provider === 'ollama');

	// 1. Try local model matching phase affinity
	const localMatch = local.find((m) => modelAffinity(m.name) === affinity);
	if (localMatch) return localMatch.name;

	// 2. Any local model (largest first for best quality)
	if (local.length > 0) {
		const sorted = [...local].sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0));
		return sorted[0].name;
	}

	// 3. Fall back to cloud model matching affinity
	const match = available.find((m) => modelAffinity(m.name) === affinity);
	if (match) return match.name;

	return available[0].name;
}

// The resolved model for AI Assist — override > local recommend > phase pref > global
export const aiModel = derived(
	[aiModelOverride, selectedPhase, phaseModelPrefs, models, selectedModel],
	([$override, $phase, $prefs, $models, $globalModel]) => {
		// 1. Explicit override for this session (highest priority)
		if ($override) return $override;

		// 2. Prefer local (Ollama) models — self-hosted, no API keys, always available
		const rec = recommendModel($phase, $models);
		if (rec) return rec;

		// 3. User-configured preference for this phase (cloud models as fallback)
		const phasePref = $prefs[$phase];
		if (phasePref && $models.some((m) => m.name === phasePref)) {
			return phasePref;
		}

		// 4. Fall back to whatever the LLM Studio has selected
		return $globalModel;
	}
);

// Set the model for a specific phase (persisted)
export function setPhaseModel(phase: PhaseCode, modelName: string | null): void {
	phaseModelPrefs.update((prefs) => {
		const updated = { ...prefs, [phase]: modelName };
		savePhaseModelPrefs(updated);
		return updated;
	});
	// Clear the session override so the pref takes effect
	aiModelOverride.set(null);
}

// Set a one-time model override (not persisted, clears on phase change)
export function setAIModelOverride(modelName: string | null): void {
	aiModelOverride.set(modelName);
}

// Clear override when phase changes
let lastPhase: PhaseCode | null = null;
selectedPhase.subscribe((phase) => {
	if (lastPhase !== null && lastPhase !== phase) {
		aiModelOverride.set(null);
	}
	lastPhase = phase;
});

// --- Derived ---
export const selectedDivision = derived(
	[divisions, selectedDivisionId],
	([$divs, $id]) => $divs.find((d) => d.division_id === $id) ?? null
);

export const ventureStep = derived(activeVenture, ($v) => {
	if (!$v) return 'none';
	if ($v.status & 32) return 'discovery_completed';
	if ($v.status & 16) return 'discovery_paused';
	if ($v.status & 8) return 'discovering';
	if ($v.status & 4) return 'vision_submitted';
	if ($v.status & 2) return 'vision_refined';
	if ($v.status & 1) return 'initiated';
	return 'none';
});

// --- API Actions ---

export async function fetchActiveVenture(): Promise<void> {
	try {
		isLoading.set(true);
		devopsError.set(null);
		const resp = await api.get<{ venture: Venture }>('/api/venture');
		activeVenture.set(resp.venture);
		if (resp.venture) {
			await fetchDivisions(resp.venture.venture_id);
		}
	} catch (e: unknown) {
		const err = e as { status?: number; message?: string };
		if (err.status === 404) {
			activeVenture.set(null);
			divisions.set([]);
		} else {
			devopsError.set(err.message || 'Failed to fetch venture');
		}
	} finally {
		isLoading.set(false);
	}
}

export async function fetchVentures(): Promise<void> {
	try {
		const resp = await api.get<{ ventures: Venture[] }>('/api/ventures');
		ventures.set(resp.ventures || []);
	} catch {
		ventures.set([]);
	}
}

export async function selectVenture(venture: Venture): Promise<void> {
	activeVenture.set(venture);
	divisions.set([]);
	selectedDivisionId.set(null);
	await fetchDivisions(venture.venture_id);
}

export function clearActiveVenture(): void {
	activeVenture.set(null);
	divisions.set([]);
	selectedDivisionId.set(null);
}

export async function fetchDivisions(ventureId: string): Promise<void> {
	try {
		const resp = await api.get<{ divisions: Division[] }>(
			`/api/ventures/${ventureId}/divisions`
		);
		divisions.set(resp.divisions || []);
		const current = get(selectedDivisionId);
		if (!current && resp.divisions?.length > 0) {
			selectedDivisionId.set(resp.divisions[0].division_id);
		}
	} catch {
		divisions.set([]);
	}
}

export async function initiateVenture(
	name: string,
	brief?: string
): Promise<Venture | null> {
	try {
		isLoading.set(true);
		devopsError.set(null);
		const resp = await api.post<Record<string, unknown>>('/api/ventures/initiate', {
			name,
			brief: brief || null,
			initiated_by: 'hecate-web'
		});
		// Set active venture immediately from POST response —
		// don't rely on fetchActiveVenture which queries the read model
		// that may not have projected the event yet (eventual consistency).
		const venture: Venture = {
			venture_id: resp.venture_id as string,
			name: resp.name as string,
			brief: (resp.brief as string) ?? null,
			status: resp.status as number,
			status_label: (resp.status_label as string) ?? 'Initiated',
			repos: (resp.repos as string[]) ?? null,
			skills: (resp.skills as string[]) ?? null,
			context_map: (resp.context_map as Record<string, unknown>) ?? null,
			initiated_at: resp.initiated_at as number,
			initiated_by: (resp.initiated_by as string) ?? null
		};
		activeVenture.set(venture);
		// Background refresh — projection will catch up
		fetchVentures();
		return venture;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to initiate venture');
		return null;
	} finally {
		isLoading.set(false);
	}
}

export async function refineVision(
	ventureId: string,
	data: { brief?: string; repos?: string[]; skills?: string[] }
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/vision/refine`, data);
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to refine vision');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function submitVision(ventureId: string): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/vision/submit`, {});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to submit vision');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function scaffoldVentureRepo(
	ventureId: string,
	repoPath: string,
	visionContent: string,
	ventureName?: string,
	brief?: string
): Promise<boolean> {
	try {
		isLoading.set(true);
		devopsError.set(null);
		await api.post(`/api/ventures/${ventureId}/scaffold`, {
			repo_path: repoPath,
			vision_content: visionContent,
			venture_name: ventureName || null,
			brief: brief || null
		});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to scaffold venture repo');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function startDiscovery(ventureId: string): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/discovery/start`, {});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to start discovery');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function identifyDivision(
	ventureId: string,
	contextName: string,
	description?: string
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/discovery/identify`, {
			context_name: contextName,
			description: description || null,
			identified_by: 'hecate-web'
		});
		await fetchDivisions(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to identify division');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function pauseDiscovery(
	ventureId: string,
	reason?: string
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/discovery/pause`, {
			reason: reason || null
		});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to pause discovery');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function resumeDiscovery(ventureId: string): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/discovery/resume`, {});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to resume discovery');
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function completeDiscovery(ventureId: string): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/discovery/complete`, {});
		await fetchActiveVenture();
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to complete discovery');
		return false;
	} finally {
		isLoading.set(false);
	}
}

// Division phase lifecycle
export async function startPhase(
	divisionId: string,
	phase: PhaseCode
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/divisions/${divisionId}/phase/start`, { phase });
		const v = get(activeVenture);
		if (v) await fetchDivisions(v.venture_id);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || `Failed to start ${phase} phase`);
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function pausePhase(
	divisionId: string,
	phase: PhaseCode,
	reason?: string
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/divisions/${divisionId}/phase/pause`, {
			phase,
			reason: reason || null
		});
		const v = get(activeVenture);
		if (v) await fetchDivisions(v.venture_id);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || `Failed to pause ${phase} phase`);
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function resumePhase(
	divisionId: string,
	phase: PhaseCode
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/divisions/${divisionId}/phase/resume`, { phase });
		const v = get(activeVenture);
		if (v) await fetchDivisions(v.venture_id);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || `Failed to resume ${phase} phase`);
		return false;
	} finally {
		isLoading.set(false);
	}
}

export async function completePhase(
	divisionId: string,
	phase: PhaseCode
): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/divisions/${divisionId}/phase/complete`, { phase });
		const v = get(activeVenture);
		if (v) await fetchDivisions(v.venture_id);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || `Failed to complete ${phase} phase`);
		return false;
	} finally {
		isLoading.set(false);
	}
}

// DnA: Design operations
export async function designAggregate(
	divisionId: string,
	data: { aggregate_name: string; description?: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/design/aggregates`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to design aggregate');
		return false;
	}
}

export async function designEvent(
	divisionId: string,
	data: { event_name: string; aggregate_type: string; description?: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/design/events`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to design event');
		return false;
	}
}

// AnP: Planning operations
export async function planDesk(
	divisionId: string,
	data: { desk_name: string; description?: string; department?: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/plan/desks`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to plan desk');
		return false;
	}
}

// TnI: Generation operations
export async function generateModule(
	divisionId: string,
	data: { module_name: string; template?: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/generate/modules`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to generate module');
		return false;
	}
}

export async function generateTests(
	divisionId: string,
	data: { test_module: string; target_module: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/generate/tests`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to generate tests');
		return false;
	}
}

// DnO: Deploy operations
export async function deployRelease(
	divisionId: string,
	version: string
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/deploy/releases`, { version });
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to deploy release');
		return false;
	}
}

export async function raiseIncident(
	divisionId: string,
	data: { incident_title: string; severity: string; description?: string }
): Promise<boolean> {
	try {
		await api.post(`/api/divisions/${divisionId}/rescue/incidents`, data);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to raise incident');
		return false;
	}
}

// --- Sticky Notes (Client-Side Event Storming) ---

export function addStickyNote(
	type: StickyNoteType,
	text: string,
	author = 'user'
): void {
	const note: StickyNote = {
		id: crypto.randomUUID(),
		type,
		text,
		author,
		created_at: Date.now()
	};
	stickyNotes.update((notes) => [...notes, note]);
}

export function removeStickyNote(noteId: string): void {
	stickyNotes.update((notes) => notes.filter((n) => n.id !== noteId));
}

export function updateStickyNote(noteId: string, text: string): void {
	stickyNotes.update((notes) =>
		notes.map((n) => (n.id === noteId ? { ...n, text } : n))
	);
}

export function groupStickyNote(
	noteId: string,
	aggregateGroup: string
): void {
	stickyNotes.update((notes) =>
		notes.map((n) =>
			n.id === noteId ? { ...n, aggregate_group: aggregateGroup } : n
		)
	);
}

// --- Design-Level Event Storming (Command-Centric Desk Cards) ---

export const deskCards = writable<DeskCard[]>([]);

export function addDeskCard(
	name: string,
	aggregate?: string,
	execution: ExecutionMode = 'human'
): string {
	const id = crypto.randomUUID();
	const card: DeskCard = {
		id,
		name: name.trim(),
		aggregate: aggregate?.trim() || undefined,
		execution,
		policies: [],
		events: []
	};
	deskCards.update((cards) => [...cards, card]);
	return id;
}

export function removeDeskCard(cardId: string): void {
	deskCards.update((cards) => cards.filter((c) => c.id !== cardId));
}

export function updateDeskCard(
	cardId: string,
	updates: Partial<Pick<DeskCard, 'name' | 'aggregate' | 'execution'>>
): void {
	deskCards.update((cards) =>
		cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
	);
}

export function setDeskExecution(cardId: string, mode: ExecutionMode): void {
	deskCards.update((cards) =>
		cards.map((c) => (c.id === cardId ? { ...c, execution: mode } : c))
	);
}

export function addPolicyToDesk(cardId: string, text: string): void {
	const policy: PolicyNote = { id: crypto.randomUUID(), text: text.trim() };
	deskCards.update((cards) =>
		cards.map((c) =>
			c.id === cardId
				? { ...c, policies: [...c.policies, policy] }
				: c
		)
	);
}

export function removePolicyFromDesk(cardId: string, policyId: string): void {
	deskCards.update((cards) =>
		cards.map((c) =>
			c.id === cardId
				? { ...c, policies: c.policies.filter((p) => p.id !== policyId) }
				: c
		)
	);
}

export function addEventToDesk(cardId: string, text: string): void {
	const event: EventNote = { id: crypto.randomUUID(), text: text.trim() };
	deskCards.update((cards) =>
		cards.map((c) =>
			c.id === cardId
				? { ...c, events: [...c.events, event] }
				: c
		)
	);
}

export function removeEventFromDesk(cardId: string, eventId: string): void {
	deskCards.update((cards) =>
		cards.map((c) =>
			c.id === cardId
				? { ...c, events: c.events.filter((e) => e.id !== eventId) }
				: c
		)
	);
}

// Derived: unique aggregates from desk cards
export const deskAggregates = derived(deskCards, ($cards) => {
	const aggs = new Set<string>();
	for (const c of $cards) {
		if (c.aggregate) aggs.add(c.aggregate);
	}
	return Array.from(aggs).sort();
});

// Derived: cards grouped by aggregate
export const deskCardsByAggregate = derived(deskCards, ($cards) => {
	const grouped = new Map<string, DeskCard[]>();
	const ungrouped: DeskCard[] = [];

	for (const c of $cards) {
		if (c.aggregate) {
			const list = grouped.get(c.aggregate) || [];
			list.push(c);
			grouped.set(c.aggregate, list);
		} else {
			ungrouped.push(c);
		}
	}

	return { grouped, ungrouped };
});

// Reset desk cards (e.g. when switching divisions)
export function resetDeskCards(): void {
	deskCards.set([]);
}

// --- Big Picture Event Storming (Venture-Level Discovery) ---

export const bigPicturePhase = writable<BigPicturePhase>('ready');
export const bigPictureEvents = writable<BigPictureEvent[]>([]);
export const eventClusters = writable<EventCluster[]>([]);
export const factArrows = writable<FactArrow[]>([]);
export const highOctaneRemaining = writable<number>(600); // seconds (10 min)
export const ventureRawEvents = writable<RawEvent[]>([]);
export const showEventStream = writable<boolean>(false);
let highOctaneTimer: ReturnType<typeof setInterval> | null = null;

// Fetch full storm state from daemon and populate stores
export async function fetchStormState(ventureId: string): Promise<void> {
	try {
		const resp = await api.get<{ storm: StormState }>(
			`/api/ventures/${ventureId}/storm/state`
		);
		const s = resp.storm;
		bigPicturePhase.set(s.phase);
		bigPictureEvents.set(s.stickies);
		eventClusters.set(s.clusters);
		factArrows.set(s.arrows);
	} catch {
		// No storm yet — stay in 'ready'
		bigPicturePhase.set('ready');
	}
}

// Fetch raw events from ReckonDB for the event stream viewer
export async function fetchVentureEvents(
	ventureId: string,
	offset = 0,
	limit = 50
): Promise<{ events: RawEvent[]; count: number }> {
	try {
		const resp = await api.get<{ events: RawEvent[]; count: number; offset: number; limit: number }>(
			`/api/ventures/${ventureId}/events?offset=${offset}&limit=${limit}`
		);
		ventureRawEvents.set(resp.events);
		return { events: resp.events, count: resp.count };
	} catch {
		return { events: [], count: 0 };
	}
}

// Start storm — POST /storm/start then start client timer
export async function startBigPictureStorm(ventureId: string): Promise<boolean> {
	try {
		isLoading.set(true);
		await api.post(`/api/ventures/${ventureId}/storm/start`, {});
		bigPicturePhase.set('storm');
		// Start client-side high-octane timer (UI concern)
		highOctaneRemaining.set(600);
		highOctaneTimer = setInterval(() => {
			highOctaneRemaining.update((t) => {
				if (t <= 1) {
					if (highOctaneTimer) {
						clearInterval(highOctaneTimer);
						highOctaneTimer = null;
					}
					return 0;
				}
				return t - 1;
			});
		}, 1000);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to start storm');
		return false;
	} finally {
		isLoading.set(false);
	}
}

// Post a new sticky — POST /storm/sticky
export async function postEventSticky(
	ventureId: string,
	text: string,
	author = 'user'
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky`, { text, author });
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to post sticky');
		return false;
	}
}

// Pull (remove) a sticky — POST /storm/sticky/:id/pull
export async function pullEventSticky(
	ventureId: string,
	stickyId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky/${stickyId}/pull`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to pull sticky');
		return false;
	}
}

// Stack one sticky onto another — POST /storm/sticky/:id/stack
export async function stackEventSticky(
	ventureId: string,
	stickyId: string,
	targetStickyId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky/${stickyId}/stack`, {
			target_sticky_id: targetStickyId
		});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to stack sticky');
		return false;
	}
}

// Unstack a sticky — POST /storm/sticky/:id/unstack
export async function unstackEventSticky(
	ventureId: string,
	stickyId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky/${stickyId}/unstack`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to unstack sticky');
		return false;
	}
}

// Groom a stack — POST /storm/stack/:id/groom
export async function groomEventStack(
	ventureId: string,
	stackId: string,
	canonicalStickyId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/stack/${stackId}/groom`, {
			canonical_sticky_id: canonicalStickyId
		});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to groom stack');
		return false;
	}
}

// Cluster a sticky — POST /storm/sticky/:id/cluster
export async function clusterEventSticky(
	ventureId: string,
	stickyId: string,
	targetClusterId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky/${stickyId}/cluster`, {
			target_cluster_id: targetClusterId
		});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to cluster sticky');
		return false;
	}
}

// Uncluster a sticky — POST /storm/sticky/:id/uncluster
export async function unclusterEventSticky(
	ventureId: string,
	stickyId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/sticky/${stickyId}/uncluster`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to uncluster sticky');
		return false;
	}
}

// Dissolve a cluster — POST /storm/cluster/:id/dissolve
export async function dissolveEventCluster(
	ventureId: string,
	clusterId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/cluster/${clusterId}/dissolve`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to dissolve cluster');
		return false;
	}
}

// Name a cluster — POST /storm/cluster/:id/name
export async function nameEventCluster(
	ventureId: string,
	clusterId: string,
	name: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/cluster/${clusterId}/name`, { name });
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to name cluster');
		return false;
	}
}

// Draw a fact arrow — POST /storm/fact
export async function drawFactArrow(
	ventureId: string,
	fromCluster: string,
	toCluster: string,
	factName: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/fact`, {
			from_cluster: fromCluster,
			to_cluster: toCluster,
			fact_name: factName
		});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to draw fact arrow');
		return false;
	}
}

// Erase a fact arrow — POST /storm/fact/:id/erase
export async function eraseFactArrow(
	ventureId: string,
	arrowId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/fact/${arrowId}/erase`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to erase fact arrow');
		return false;
	}
}

// Promote a cluster to a division — POST /storm/cluster/:id/promote
export async function promoteEventCluster(
	ventureId: string,
	clusterId: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/cluster/${clusterId}/promote`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to promote cluster');
		return false;
	}
}

// Advance storm phase — POST /storm/phase/advance
export async function advanceStormPhase(
	ventureId: string,
	nextPhase: string
): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/phase/advance`, {
			target_phase: nextPhase
		});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to advance phase');
		return false;
	}
}

// Shelve storm — POST /storm/shelve
export async function shelveStorm(ventureId: string): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/shelve`, {});
		bigPicturePhase.set('shelved');
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to shelve storm');
		return false;
	}
}

// Resume storm — POST /storm/resume
export async function resumeStorm(ventureId: string): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/resume`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to resume storm');
		return false;
	}
}

// Archive storm — POST /storm/archive
export async function archiveStorm(ventureId: string): Promise<boolean> {
	try {
		await api.post(`/api/ventures/${ventureId}/storm/archive`, {});
		await fetchStormState(ventureId);
		return true;
	} catch (e: unknown) {
		const err = e as { message?: string };
		devopsError.set(err.message || 'Failed to archive storm');
		return false;
	}
}

// Promote ALL active clusters to divisions (batch convenience)
export async function promoteAllClusters(ventureId: string): Promise<boolean> {
	const clusters = get(eventClusters);
	let allOk = true;
	for (const cluster of clusters) {
		if (cluster.status !== 'active' || !cluster.name?.trim()) continue;
		const ok = await promoteEventCluster(ventureId, cluster.cluster_id);
		if (!ok) allOk = false;
	}
	if (allOk) {
		await fetchDivisions(ventureId);
	}
	return allOk;
}

// Derived: unclustered stickies (not assigned to any cluster)
export const unclusteredEvents = derived(
	bigPictureEvents,
	($events) => $events.filter((e) => !e.cluster_id)
);

// Derived: stickies grouped by stack_id
export const stickyStacks = derived(
	bigPictureEvents,
	($events) => {
		const stacks = new Map<string, BigPictureEvent[]>();
		for (const e of $events) {
			if (e.stack_id) {
				const existing = stacks.get(e.stack_id) || [];
				existing.push(e);
				stacks.set(e.stack_id, existing);
			}
		}
		return stacks;
	}
);

// Derived: event count for display
export const bigPictureEventCount = derived(
	bigPictureEvents,
	($events) => $events.length
);

// Reset big picture state (e.g. when switching ventures)
export function resetBigPicture(): void {
	if (highOctaneTimer) {
		clearInterval(highOctaneTimer);
		highOctaneTimer = null;
	}
	bigPicturePhase.set('ready');
	bigPictureEvents.set([]);
	eventClusters.set([]);
	factArrows.set([]);
	ventureRawEvents.set([]);
	highOctaneRemaining.set(600);
}

// --- AI Assist ---

export function openAIAssist(context: string, agentId?: string): void {
	aiAssistAgent.set(agentId ?? null);
	aiAssistContext.set(context);
	showAIAssist.set(true);
}

export function closeAIAssist(): void {
	showAIAssist.set(false);
	aiAssistAgent.set(null);
}

// Parse agent response for event names (one per line, strip bullets/dashes/numbers)
export function parseAgentEvents(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.replace(/^[\s\-*•\d.]+/, '').trim())
		.filter((line) => line.length > 0 && line.length < 80 && !line.includes(':'))
		.map((line) => line.replace(/["`]/g, ''));
}

// --- Phase Metadata ---

export const PHASES: Array<{
	code: PhaseCode;
	name: string;
	shortName: string;
	description: string;
	role: string;
	color: string;
}> = [
	{
		code: 'dna',
		name: 'Discovery & Analysis',
		shortName: 'DnA',
		description: 'Understand the domain through event storming',
		role: 'dna',
		color: 'phase-dna'
	},
	{
		code: 'anp',
		name: 'Architecture & Planning',
		shortName: 'AnP',
		description: 'Plan desks, map dependencies, sequence work',
		role: 'anp',
		color: 'phase-anp'
	},
	{
		code: 'tni',
		name: 'Testing & Implementation',
		shortName: 'TnI',
		description: 'Generate code, run tests, validate criteria',
		role: 'tni',
		color: 'phase-tni'
	},
	{
		code: 'dno',
		name: 'Deployment & Operations',
		shortName: 'DnO',
		description: 'Deploy, monitor health, handle incidents',
		role: 'dno',
		color: 'phase-dno'
	}
];

// --- Agent Personas ---

// Big Picture Event Storming agents (venture-level discovery)
export const BIG_PICTURE_AGENTS = [
	{
		id: 'oracle' as const,
		name: 'The Oracle',
		role: 'Domain Expert',
		icon: '\u{25C7}',
		description: 'Rapid-fires domain events from the vision document',
		prompt: 'You are The Oracle, a domain expert participating in a Big Picture Event Storming session. Your job is to rapidly identify domain events \u2014 things that HAPPEN in the business domain. Think about the full timeline of the business: from user acquisition to daily operations to exceptional cases. Output ONLY event names in past tense business language (e.g., "order_placed", "payment_received", "subscription_cancelled"). One per line. Be fast, be prolific, aim for volume over perfection. Do NOT explain \u2014 just list events.'
	},
	{
		id: 'architect' as const,
		name: 'The Architect',
		role: 'Boundary Spotter',
		icon: '\u{25B3}',
		description: 'Identifies natural context boundaries between event clusters',
		prompt: 'You are The Architect, a DDD strategist participating in a Big Picture Event Storming. Given the events on the board, your job is to identify BOUNDED CONTEXT BOUNDARIES \u2014 which events naturally cluster together? What are the natural seams? Name the candidate contexts (divisions) and list which events belong to each. Think about: different teams, different data ownership, different business capabilities, different rates of change.'
	},
	{
		id: 'advocate' as const,
		name: 'The Advocate',
		role: "Devil's Advocate",
		icon: '\u{2605}',
		description: 'Challenges context boundaries and finds missing events',
		prompt: "You are The Advocate, a devil's advocate in a Big Picture Event Storming. Your job is to: (1) Identify MISSING events \u2014 what's not on the board that should be? Think about failure cases, edge cases, administrative operations, lifecycle events. (2) Challenge proposed boundaries \u2014 is this really one context or two? Are we splitting too fine or too coarse? Be specific and constructive."
	},
	{
		id: 'scribe' as const,
		name: 'The Scribe',
		role: 'Integration Mapper',
		icon: '\u{25A1}',
		description: 'Maps how contexts communicate via integration facts',
		prompt: 'You are The Scribe, an integration mapper in a Big Picture Event Storming. Given the identified contexts (divisions) and their events, your job is to map INTEGRATION FACTS \u2014 how do these contexts communicate? For each relationship: which context publishes what fact, and which context consumes it? Use the format: "Context A publishes fact_name \u2192 Context B". Think about: upstream/downstream relationships, conformist vs anticorruption layer, shared kernel vs separate ways.'
	}
];

// Design-Level Event Storming agents (division-level DnA)
export const AGENT_PERSONAS = [
	{
		id: 'oracle' as const,
		name: 'The Oracle',
		role: 'Domain Expert',
		icon: '\u{25C7}',
		description:
			'Identifies domain events and business processes from the problem space',
		prompt:
			'You are The Oracle, a domain expert participating in a Design-Level Event Storming session for a single bounded context. Your specialty is identifying business events \u2014 things that HAPPEN in the domain. Think about the business process timeline: what events occur? Use past tense and business language. For each suggestion, provide: the event name (in snake_case_v1 format) and a one-line rationale. Focus on the WHAT, not the HOW.'
	},
	{
		id: 'architect' as const,
		name: 'The Architect',
		role: 'Technical Lead',
		icon: '\u{25B3}',
		description:
			'Identifies aggregates, boundaries, and structural patterns',
		prompt:
			'You are The Architect, a technical lead specializing in Domain-Driven Design participating in a Design-Level Event Storming session. Your specialty is identifying aggregate boundaries \u2014 which events belong together? What are the natural groupings? Suggest aggregates (in snake_case format) and explain which events cluster around them. Focus on consistency boundaries and invariants.'
	},
	{
		id: 'advocate' as const,
		name: 'The Advocate',
		role: "Devil's Advocate",
		icon: '\u{2605}',
		description:
			'Questions assumptions, identifies edge cases and hotspots',
		prompt:
			"You are The Advocate, a devil's advocate participating in a Design-Level Event Storming session. Your specialty is finding problems \u2014 what could go wrong? What edge cases exist? What assumptions are being made? Identify hotspots (areas of complexity, risk, or uncertainty). Challenge every assumption. Be specific about what might fail."
	},
	{
		id: 'scribe' as const,
		name: 'The Scribe',
		role: 'Process Analyst',
		icon: '\u{25A1}',
		description:
			'Organizes discoveries, identifies read models and policies',
		prompt:
			'You are The Scribe, a process analyst participating in a Design-Level Event Storming session. Your specialty is organizing and documenting. Identify what read models are needed (what queries will users run?). What policies govern the business rules? Suggest read models (in snake_case format) and policies. Focus on what information needs to be queryable and what rules constrain the domain.'
	}
];
