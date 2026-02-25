import type { Model } from '$lib/types/llm';

export const SPECIALTIES = ['General Purpose', 'Coding', 'Research'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

const CODING_PATTERNS = /code|coder|codestral|starcoder/i;
const RESEARCH_PATTERNS = /thinking|think|deepthink|\br1\b|\bo1\b|\bo3\b/i;

export function specialtyOf(m: Model): Specialty {
	if (CODING_PATTERNS.test(m.name) || CODING_PATTERNS.test(m.family ?? '')) return 'Coding';
	if (RESEARCH_PATTERNS.test(m.name) || RESEARCH_PATTERNS.test(m.family ?? '')) return 'Research';
	return 'General Purpose';
}

export function costOf(m: Model): string {
	if (m.provider === 'ollama') return '\u20AC';
	if (m.provider === 'groq') return '\u20AC';
	if (m.provider === 'google') {
		if (/flash/i.test(m.name)) return '\u20AC';
		return '\u20AC\u20AC';
	}
	if (m.provider === 'anthropic') {
		if (/haiku/i.test(m.name)) return '\u20AC\u20AC';
		return '\u20AC\u20AC\u20AC';
	}
	return '\u20AC\u20AC';
}

export function filterModels(
	models: Model[],
	searchText: string,
	selectedProvider: string | null,
	selectedSpecialty: string | null
): Model[] {
	return models.filter((m) => {
		const matchesSearch = !searchText || m.name.toLowerCase().includes(searchText.toLowerCase());
		const matchesProvider = !selectedProvider || m.provider === selectedProvider;
		const matchesSpecialty = !selectedSpecialty || specialtyOf(m) === selectedSpecialty;
		return matchesSearch && matchesProvider && matchesSpecialty;
	});
}
