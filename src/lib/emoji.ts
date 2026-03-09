// Emoji shortcode resolution using GitHub's gemoji data.
// Manifests and plugin info can use shortcode names (e.g. "pencil2", "rocket")
// instead of raw UTF-8 emoji. This module resolves them to unicode.

import { nameToEmoji } from 'gemoji';

const shortcodeMap: Record<string, string> = nameToEmoji;

/**
 * Resolve an icon value to a unicode emoji.
 *
 * Accepts:
 *   - Shortcode name: "pencil2" → "✏️"
 *   - Colon-wrapped:  ":pencil2:" → "✏️"
 *   - Already unicode: "✏️" → "✏️" (passthrough)
 *   - Null/undefined: returns fallback
 */
export function resolveEmoji(icon: string | null | undefined, fallback = '\uD83D\uDD0C'): string {
	if (!icon) return fallback;

	// Strip optional colons: ":pencil2:" → "pencil2"
	const stripped = icon.startsWith(':') && icon.endsWith(':')
		? icon.slice(1, -1)
		: icon;

	// Try shortcode lookup
	const resolved = shortcodeMap[stripped];
	if (resolved) return resolved;

	// Already unicode or unknown — pass through
	return icon;
}
