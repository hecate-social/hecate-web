// MPong game state store
import { writable, derived } from 'svelte/store';
import { isTauri } from '$lib/tauri';
import { onDaemonEvent } from '$lib/stores/events';

const BASE = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';

// Types

export interface MpongPlayer {
	node_id: string;
	wall_index: number;
	alive: boolean;
	joined_at: number;
}

export interface MpongGame {
	game_id: string;
	host_node_id: string;
	players: MpongPlayer[];
	max_players: number;
	status: 'waiting' | 'playing' | 'ended';
	hosted_at: number;
	started_at?: number | null;
	ended_at?: number | null;
	winner_node_id?: string | null;
}

export interface Champion {
	node_id: string;
	name: string;
	personality: {
		style: string;
		speed: number;
		bias_range: number;
		err_rate: number;
		err_mag: number;
		aggression: number;
	};
	wins: number;
	losses: number;
	games_played: number;
}

export interface LobbyInfo {
	game_id: string;
	host_node: string;
	host_champion_name: string;
	max_players: number;
	seats: LobbySeat[];
	state: 'waiting' | 'countdown' | 'playing';
	countdown: number;
	open_seats: number;
}

export interface LobbySeat {
	wall_index: number;
	status: 'open' | 'reserved';
	champion_name: string | null;
	node_id: string | null;
}

export interface Obstacle {
	x: number;
	y: number;
	hw: number;
	hh: number;
	ttl: number;
}

export interface BallState {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	spin?: number;
}

export interface MpongGameState {
	game_id: string;
	ball: BallState;
	paddles: Record<number, number>;
	alive: Record<number, boolean>;
	points: Record<number, number>;
	games_won: Record<number, number>;
	serving: number;
	obstacles: Obstacle[];
	paused: boolean;
	tick: number;
	arena: { w: number; h: number };
}

// Stores

export const games = writable<MpongGame[]>([]);
export const currentGame = writable<MpongGame | null>(null);
export const gameState = writable<MpongGameState | null>(null);
export const connected = writable(false);
export const champion = writable<Champion | null>(null);
export const lobbies = writable<LobbyInfo[]>([]);
export const currentLobby = writable<LobbyInfo | null>(null);

export const isPlaying = derived(currentGame, ($g) => $g?.status === 'playing');

// API

export async function fetchGames(): Promise<void> {
	try {
		const res = await fetch(`${BASE}/api/mpong/games`);
		const data = await res.json();
		if (data.ok) games.set(data.games ?? []);
	} catch { /* */ }
}

export async function fetchGame(gameId: string): Promise<MpongGame | null> {
	try {
		const res = await fetch(`${BASE}/api/mpong/games/${gameId}`);
		const data = await res.json();
		if (data.ok) { currentGame.set(data.game); return data.game; }
	} catch { /* */ }
	return null;
}

export async function fetchChampion(): Promise<Champion | null> {
	try {
		const res = await fetch(`${BASE}/api/mpong/champion`);
		const data = await res.json();
		if (data.ok) { champion.set(data.champion); return data.champion; }
	} catch { /* */ }
	return null;
}

export async function fetchLobbies(): Promise<void> {
	try {
		const res = await fetch(`${BASE}/api/mpong/lobbies`);
		const data = await res.json();
		if (data.ok) lobbies.set(data.lobbies ?? []);
	} catch { /* */ }
}

export async function openLobby(maxPlayers: number = 2): Promise<string | null> {
	try {
		const res = await fetch(`${BASE}/api/mpong/lobby/open`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ max_players: maxPlayers })
		});
		const data = await res.json();
		if (data.ok) return data.game_id;
	} catch { /* */ }
	return null;
}

export async function quickStart(botCount: number = 2): Promise<string | null> {
	try {
		const res = await fetch(`${BASE}/api/mpong/host`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ max_players: botCount, quick_start: true, bot_count: botCount })
		});
		const data = await res.json();
		if (data.ok) return data.game_id;
	} catch { /* */ }
	return null;
}

export async function startGame(gameId: string): Promise<boolean> {
	try {
		const res = await fetch(`${BASE}/api/mpong/games/${gameId}/start`, { method: 'POST' });
		const data = await res.json();
		if (data.ok) { await fetchGame(gameId); return true; }
	} catch { /* */ }
	return false;
}

// Game state streaming via existing daemon SSE (/api/events)

let unsubState: (() => void) | null = null;
let unsubLobby: (() => void) | null = null;
let unsubCountdown: (() => void) | null = null;
let unsubLobbyJoined: (() => void) | null = null;

export function connectGameStream(gameId: string): void {
	disconnectGameStream();
	connected.set(true);

	unsubState = onDaemonEvent('mpong_state', (data: unknown) => {
		const state = data as MpongGameState;
		if (state.game_id === gameId) gameState.set(state);
	});
}

export function connectLobbyStream(): void {
	disconnectLobbyStream();

	unsubLobby = onDaemonEvent('mpong_lobby', (data: unknown) => {
		currentLobby.set(data as LobbyInfo);
	});

	unsubCountdown = onDaemonEvent('mpong_countdown', (data: unknown) => {
		const cd = data as { game_id: string; countdown: number };
		currentLobby.update((l) => l ? { ...l, state: 'countdown', countdown: cd.countdown } : l);
	});

	unsubLobbyJoined = onDaemonEvent('mpong_lobby_joined', (data: unknown) => {
		const info = data as { game_id: string; wall_index: number };
		currentLobby.update((l) => l ? { ...l, game_id: info.game_id } : l);
	});
}

export function disconnectGameStream(): void {
	if (unsubState) { unsubState(); unsubState = null; }
	connected.set(false);
	gameState.set(null);
}

export function disconnectLobbyStream(): void {
	if (unsubLobby) { unsubLobby(); unsubLobby = null; }
	if (unsubCountdown) { unsubCountdown(); unsubCountdown = null; }
	if (unsubLobbyJoined) { unsubLobbyJoined(); unsubLobbyJoined = null; }
	currentLobby.set(null);
}
