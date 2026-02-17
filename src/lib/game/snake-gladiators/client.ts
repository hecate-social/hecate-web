// API client for snake gladiators training.
// Request-response via hecate:// protocol, SSE via Tauri command + event listener.

import { get, post } from '$lib/api';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Stable, Champion, GenerationStats, TrainingProgress, Hero, FitnessWeights } from './types';

interface InitiateStableResponse {
	ok: boolean;
	stable_id: string;
}

/** List all training stables. */
export async function fetchStables(): Promise<Stable[]> {
	const resp = await get<{ ok: boolean; stables: Stable[] }>(
		'/api/arcade/gladiators/stables'
	);
	return resp.stables ?? [];
}

/** Get a single stable by ID. */
export async function fetchStable(stableId: string): Promise<Stable> {
	return get<Stable>(`/api/arcade/gladiators/stables/${stableId}`);
}

/** Get the rank-1 champion from a completed stable. */
export async function fetchChampion(stableId: string): Promise<Champion> {
	return get<Champion>(`/api/arcade/gladiators/stables/${stableId}/champion`);
}

/** Get all ranked champions from a completed stable. */
export async function fetchChampions(stableId: string): Promise<Champion[]> {
	const resp = await get<{ ok: boolean; champions: Champion[] }>(
		`/api/arcade/gladiators/stables/${stableId}/champions`
	);
	return resp.champions ?? [];
}

/** Get generation-by-generation stats for a stable. */
export async function fetchGenerations(stableId: string): Promise<GenerationStats[]> {
	const resp = await get<{ ok: boolean; generations: GenerationStats[] }>(
		`/api/arcade/gladiators/stables/${stableId}/generations`
	);
	return resp.generations ?? [];
}

/** Start a new training stable. Returns the stable_id. */
export async function initiateStable(config: {
	population_size: number;
	max_generations: number;
	opponent_af: number;
	episodes_per_eval: number;
	champion_count?: number;
	seed_stable_id?: string;
	training_config?: {
		fitness_weights?: FitnessWeights;
		fitness_preset?: string;
		enable_ltc?: boolean;
	};
}): Promise<string> {
	const resp = await post<InitiateStableResponse>(
		'/api/arcade/gladiators/stables',
		config
	);
	return resp.stable_id;
}

/** Start a champion duel match. Returns the match_id for SSE streaming. */
export async function startChampionDuel(
	stableId: string,
	opponentAf: number,
	tickMs: number,
	rank: number = 1
): Promise<string> {
	const resp = await post<{ ok: boolean; match_id: string }>(
		`/api/arcade/gladiators/stables/${stableId}/duel`,
		{ opponent_af: opponentAf, tick_ms: tickMs, rank }
	);
	return resp.match_id;
}

/** Halt an active training run. */
export async function haltTraining(stableId: string): Promise<void> {
	await post<{ ok: boolean }>(`/api/arcade/gladiators/stables/${stableId}/halt`, {});
}

/** Export the champion from a completed stable. */
export async function exportChampion(stableId: string): Promise<Champion> {
	return post<Champion>(`/api/arcade/gladiators/stables/${stableId}/export`, {});
}

// ─── Heroes API ──────────────────────────────────────────────────

/** List all heroes. */
export async function fetchHeroes(): Promise<Hero[]> {
	const resp = await get<{ ok: boolean; heroes: Hero[] }>(
		'/api/arcade/gladiators/heroes'
	);
	return resp.heroes ?? [];
}

/** Get a single hero by ID. */
export async function fetchHero(heroId: string): Promise<Hero> {
	return get<Hero>(`/api/arcade/gladiators/heroes/${heroId}`);
}

/** Promote a champion to a permanent hero. */
export async function promoteChampion(
	stableId: string,
	name: string
): Promise<Hero> {
	return post<Hero>('/api/arcade/gladiators/heroes', {
		stable_id: stableId,
		name
	});
}

/** Start a hero duel vs AI. Returns match_id for SSE streaming. */
export async function startHeroDuel(
	heroId: string,
	opponentAf: number,
	tickMs: number
): Promise<string> {
	const resp = await post<{ ok: boolean; match_id: string }>(
		`/api/arcade/gladiators/heroes/${heroId}`,
		{ opponent_af: opponentAf, tick_ms: tickMs }
	);
	return resp.match_id;
}

// ─── SSE Streams ─────────────────────────────────────────────────

/** Connect to the SSE stream for live training progress via Tauri command.
 *  Returns a cleanup function that removes listeners.
 */
export async function connectTrainingStream(
	stableId: string,
	onProgress: (data: TrainingProgress) => void,
	onDone?: () => void,
	onError?: (error: string) => void
): Promise<() => void> {
	const streamId = crypto.randomUUID();
	const progressEvent = `gladiator-progress-${streamId}`;
	const doneEvent = `gladiator-done-${streamId}`;
	const errorEvent = `gladiator-error-${streamId}`;

	const unlisteners: UnlistenFn[] = [];

	const unProgress = await listen<TrainingProgress>(progressEvent, (event) => {
		try {
			onProgress(event.payload);
		} catch (e) {
			console.error('[gladiators] Failed to parse SSE data:', e);
		}
	});
	unlisteners.push(unProgress);

	const unDone = await listen(doneEvent, () => {
		if (onDone) onDone();
	});
	unlisteners.push(unDone);

	const unError = await listen<{ type: string; error: string }>(errorEvent, (event) => {
		console.error('[gladiators] stream error:', event.payload.error);
		if (onError) onError(event.payload.error);
	});
	unlisteners.push(unError);

	try {
		await invoke('gladiator_training_stream', { streamId, stableId });
	} catch (e) {
		console.error('[gladiators] invoke gladiator_training_stream failed:', e);
		for (const un of unlisteners) un();
		throw e;
	}

	return () => {
		for (const un of unlisteners) un();
	};
}
