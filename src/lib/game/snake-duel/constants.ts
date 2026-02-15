export const GRID_WIDTH = 30;
export const GRID_HEIGHT = 24;
export const CELL_SIZE = 16;
export const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
export const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;
export const DEFAULT_TICK_MS = 100;

export const COLORS = {
	background: '#0f0f1a',
	grid: '#2a2a50',
	player1: '#3b82f6',
	player1Head: '#60a5fa',
	player2: '#ef4444',
	player2Head: '#f87171',
	food: '#fbbf24',
	poison: '#a855f7',
	poisonGlow: '#7c3aed',
	eye: '#ffffff'
} as const;

export const INITIAL_SNAKE_1: [number, number][] = [
	[4, 4],
	[3, 4],
	[2, 4]
];

export const INITIAL_SNAKE_2: [number, number][] = [
	[25, 19],
	[26, 19],
	[27, 19]
];
