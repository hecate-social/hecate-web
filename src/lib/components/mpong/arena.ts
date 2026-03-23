// Octagonal (N-gonal) arena geometry for MPong
// Must match server-side mpong_arena.erl exactly

export interface Point {
	x: number;
	y: number;
}

export interface Wall {
	p1: Point;
	p2: Point;
}

export interface ArenaGeometry {
	playerCount: number;
	radius: number;
	walls: Wall[];
	center: Point;
}

/**
 * Create arena geometry for N players.
 * Center at (0,0), radius 1.0 (normalized coordinates).
 * Must match mpong_arena:new/1 on the server.
 */
export function createArena(playerCount: number): ArenaGeometry {
	const R = 1.0;
	const vertices: Point[] = [];

	let walls: Wall[];

	if (playerCount === 2) {
		// Classic pong: two parallel vertical walls
		walls = [
			{ p1: { x: -R, y: -R }, p2: { x: -R, y: R } }, // Left wall (player 0)
			{ p1: { x: R, y: R }, p2: { x: R, y: -R } } // Right wall (player 1)
		];
	} else {
		// N-gon polygon
		for (let i = 0; i < playerCount; i++) {
			const angle = (2.0 * Math.PI * i) / playerCount - Math.PI / 2.0;
			vertices.push({
				x: R * Math.cos(angle),
				y: R * Math.sin(angle)
			});
		}
		walls = [];
		for (let i = 0; i < playerCount; i++) {
			walls.push({
				p1: vertices[i],
				p2: vertices[(i + 1) % playerCount]
			});
		}
	}

	return {
		playerCount,
		radius: R,
		walls,
		center: { x: 0, y: 0 }
	};
}

/**
 * Get paddle endpoints on a wall given position (0-1) and width (fraction).
 */
export function paddleSegment(
	wall: Wall,
	position: number,
	width: number = 0.2
): { start: Point; end: Point } {
	const halfW = width / 2;
	const startT = Math.max(0, position - halfW);
	const endT = Math.min(1, position + halfW);

	return {
		start: {
			x: wall.p1.x + (wall.p2.x - wall.p1.x) * startT,
			y: wall.p1.y + (wall.p2.y - wall.p1.y) * startT
		},
		end: {
			x: wall.p1.x + (wall.p2.x - wall.p1.x) * endT,
			y: wall.p1.y + (wall.p2.y - wall.p1.y) * endT
		}
	};
}

// Player color palette (up to 8 players)
export const PLAYER_COLORS = [
	'#ef4444', // red
	'#3b82f6', // blue
	'#22c55e', // green
	'#eab308', // yellow
	'#a855f7', // purple
	'#f97316', // orange
	'#06b6d4', // cyan
	'#ec4899' // pink
];

export const DEAD_COLOR = '#374151'; // gray-700
export const BALL_COLOR = '#ffffff';
export const ARENA_BG = '#111827'; // gray-900
export const PADDLE_COLOR = '#f9fafb'; // gray-50
