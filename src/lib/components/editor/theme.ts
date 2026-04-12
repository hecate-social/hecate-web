// Hecate dark theme for CodeMirror 6
//
// Matches the hecate design system: surface-* backgrounds, hecate-* accents.

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const hecateTheme = EditorView.theme({
	'&': {
		backgroundColor: 'var(--color-surface-900, #0a0a0f)',
		color: 'var(--color-surface-200, #d4d4d8)',
		fontSize: '13px',
		fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
	},
	'.cm-content': {
		caretColor: 'var(--color-macula-400, #818cf8)',
		padding: '0.5rem 0',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'var(--color-macula-400, #818cf8)',
		borderLeftWidth: '2px',
	},
	// Vim fat cursor
	'.cm-fat-cursor .cm-cursor': {
		background: 'var(--color-macula-400, #818cf8) !important',
		border: 'none !important',
		width: '0.6em',
		opacity: '0.7',
	},
	'.cm-activeLine': {
		backgroundColor: 'rgba(129, 140, 248, 0.06)',
	},
	'.cm-selectionMatch': {
		backgroundColor: 'rgba(129, 140, 248, 0.15)',
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'rgba(129, 140, 248, 0.25) !important',
	},
	'.cm-gutters': {
		backgroundColor: 'var(--color-surface-900, #0a0a0f)',
		color: 'var(--color-surface-600, #52525b)',
		border: 'none',
		paddingRight: '4px',
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'rgba(129, 140, 248, 0.06)',
		color: 'var(--color-surface-400, #a1a1aa)',
	},
	'.cm-foldPlaceholder': {
		backgroundColor: 'var(--color-surface-800, #27272a)',
		color: 'var(--color-surface-400, #a1a1aa)',
		border: 'none',
	},
	'.cm-tooltip': {
		backgroundColor: 'var(--color-surface-800, #27272a)',
		border: '1px solid var(--color-surface-700, #3f3f46)',
		color: 'var(--color-surface-200, #d4d4d8)',
	},
	'.cm-tooltip-autocomplete': {
		'& > ul > li[aria-selected]': {
			backgroundColor: 'var(--color-macula-600, #4f46e5)',
			color: 'white',
		},
	},
	// Search panel
	'.cm-panels': {
		backgroundColor: 'var(--color-surface-800, #27272a)',
		borderTop: '1px solid var(--color-surface-700, #3f3f46)',
		color: 'var(--color-surface-200, #d4d4d8)',
	},
	'.cm-searchMatch': {
		backgroundColor: 'rgba(255, 166, 87, 0.25)',
		outline: '1px solid rgba(255, 166, 87, 0.4)',
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'rgba(129, 140, 248, 0.35)',
	},
	// Vim status bar (built-in)
	'.cm-vim-panel': {
		backgroundColor: 'var(--color-surface-800, #27272a)',
		color: 'var(--color-surface-200, #d4d4d8)',
		padding: '2px 8px',
		fontSize: '11px',
		fontFamily: 'ui-monospace, SFMono-Regular, monospace',
	},
	'.cm-vim-panel input': {
		backgroundColor: 'transparent',
		color: 'var(--color-surface-100, #f4f4f5)',
		border: 'none',
		outline: 'none',
		fontFamily: 'inherit',
		fontSize: 'inherit',
	},
}, { dark: true });

export const hecateHighlightStyle = syntaxHighlighting(HighlightStyle.define([
	{ tag: tags.keyword, color: '#ff7b72' },
	{ tag: tags.operator, color: '#ff7b72' },
	{ tag: tags.special(tags.brace), color: '#ff7b72' },
	{ tag: tags.definitionKeyword, color: '#ff7b72' },
	{ tag: tags.moduleKeyword, color: '#ff7b72' },
	{ tag: tags.controlKeyword, color: '#ff7b72' },

	{ tag: tags.name, color: '#d2a8ff' },
	{ tag: tags.definition(tags.variableName), color: '#d2a8ff' },
	{ tag: tags.function(tags.variableName), color: '#d2a8ff' },
	{ tag: tags.definition(tags.propertyName), color: '#79c0ff' },
	{ tag: tags.typeName, color: '#ffa657' },
	{ tag: tags.className, color: '#ffa657' },
	{ tag: tags.labelName, color: '#ffa657' },
	{ tag: tags.namespace, color: '#ffa657' },

	{ tag: tags.string, color: '#a5d6ff' },
	{ tag: tags.special(tags.string), color: '#a5d6ff' },
	{ tag: tags.regexp, color: '#a5d6ff' },

	{ tag: tags.number, color: '#79c0ff' },
	{ tag: tags.bool, color: '#79c0ff' },
	{ tag: tags.null, color: '#79c0ff' },

	{ tag: tags.atom, color: '#79c0ff' },
	{ tag: tags.unit, color: '#79c0ff' },

	{ tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
	{ tag: tags.lineComment, color: '#6a737d', fontStyle: 'italic' },
	{ tag: tags.blockComment, color: '#6a737d', fontStyle: 'italic' },

	{ tag: tags.meta, color: '#79c0ff' },
	{ tag: tags.annotation, color: '#79c0ff' },
	{ tag: tags.processingInstruction, color: '#79c0ff' },

	{ tag: tags.attributeName, color: '#79c0ff' },
	{ tag: tags.attributeValue, color: '#a5d6ff' },

	{ tag: tags.link, color: '#818cf8', textDecoration: 'underline' },
	{ tag: tags.url, color: '#818cf8', textDecoration: 'underline' },

	{ tag: tags.heading, color: '#ff7b72', fontWeight: 'bold' },
	{ tag: tags.heading1, color: '#ff7b72', fontWeight: 'bold', fontSize: '1.4em' },
	{ tag: tags.heading2, color: '#ff7b72', fontWeight: 'bold', fontSize: '1.2em' },
	{ tag: tags.heading3, color: '#ff7b72', fontWeight: 'bold', fontSize: '1.1em' },

	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },

	{ tag: tags.invalid, color: '#ffa198' },
]));
