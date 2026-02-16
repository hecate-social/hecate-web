export const DEFAULTS = {
	populationSize: 50,
	maxGenerations: 30,
	opponentAf: 30,
	episodesPerEval: 3
};

export const COLORS = {
	fitness: '#a78bfa',
	avgFitness: '#60a5fa',
	worstFitness: '#f87171',
	training: '#fbbf24',
	completed: '#22c55e',
	halted: '#ef4444'
} as const;
