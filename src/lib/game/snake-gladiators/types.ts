export interface Stable {
	stable_id: string;
	status: 'training' | 'completed' | 'halted';
	population_size: number;
	max_generations: number;
	opponent_af: number;
	episodes_per_eval: number;
	best_fitness: number;
	generations_completed: number;
	started_at: number;
	completed_at: number | null;
}

export interface GenerationStats {
	stable_id: string;
	generation: number;
	best_fitness: number;
	avg_fitness: number;
	worst_fitness: number;
	timestamp: number;
}

export interface Champion {
	stable_id: string;
	network_json: string;
	fitness: number;
	generation: number;
	wins: number;
	losses: number;
	draws: number;
	exported_at: number;
}

/** SSE progress event from training stream */
export interface TrainingProgress {
	generation: number;
	best_fitness: number;
	avg_fitness: number;
	worst_fitness: number;
	running: boolean;
}
