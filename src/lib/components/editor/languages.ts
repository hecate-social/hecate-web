// Language detection from file extension → CodeMirror language support
//
// Uses @codemirror/language-data for comprehensive extension→language mapping.
// Falls back to manual overrides for extensions not covered.

import type { LanguageSupport } from '@codemirror/language';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

/** Find a LanguageDescription by filename. */
function findByFilename(filename: string): LanguageDescription | null {
	return LanguageDescription.matchFilename(languages, filename);
}

/** Get CodeMirror language support for a file path/name. Returns a promise since language-data lazy-loads. */
export async function languageForFilename(filename: string): Promise<LanguageSupport | null> {
	const desc = findByFilename(filename);
	if (!desc) return null;
	return await desc.load();
}

/** Get a human-readable language label. */
export function languageLabel(ext: string): string {
	// Try matching a fake filename with that extension
	const desc = findByFilename(`file${ext}`);
	if (desc) return desc.name;

	const labels: Record<string, string> = {
		'.erl': 'Erlang', '.hrl': 'Erlang',
		'.ex': 'Elixir', '.exs': 'Elixir',
		'.svelte': 'Svelte',
		'.toml': 'TOML',
		'.txt': 'Text',
		'.conf': 'Config', '.cfg': 'Config', '.ini': 'Config', '.env': 'Config',
	};
	return labels[ext.toLowerCase()] ?? 'Plain';
}
