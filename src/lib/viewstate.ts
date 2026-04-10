///
/// Viewstate — maps daemon-computed presentation to CSS/chars.
///
/// The daemon is the single source of truth for WHAT to display.
/// This file contains two static lookup maps — no conditional logic.
///

export const variantClass: Record<string, string> = {
	neutral: 'text-surface-400',
	ok: 'text-health-ok',
	warn: 'text-amber-400 animate-pulse',
	err: 'text-health-err',
	accent: 'text-hecate-400',
	dim: 'text-surface-600',
};

export const iconChar: Record<string, string> = {
	'circle-filled': '\u25CF',
	'circle-outline': '\u25CB',
	'diamond-filled': '\u25C6',
	'diamond-outline': '\u25C7',
	'check': '\u2713',
	'cross': '\u2717',
	'globe': '\uD83C\uDF10',
};

// --- Viewstate types (mirrors daemon hecate_viewstate.erl) ---

export interface Indicator {
	icon: string;
	variant: string;
	label?: string | null;
	sublabel?: string | null;
	visible?: boolean;
}

export interface StartupStep {
	id: string;
	icon: string;
	variant: string;
	label: string;
	detail: string;
}

export interface HeaderViewstate {
	daemon: Indicator;
	mesh: Indicator;
	realm: Indicator;
}

export interface StartupViewstate {
	done: boolean;
	steps: StartupStep[];
}

export interface Viewstate {
	header: HeaderViewstate;
	startup: StartupViewstate;
}

/// Fallback viewstate when daemon hasn't responded yet.
export const emptyViewstate: Viewstate = {
	header: {
		daemon: { icon: 'circle-outline', variant: 'warn' },
		mesh: { icon: 'diamond-filled', variant: 'neutral', label: 'Local', sublabel: null },
		realm: { visible: false, icon: 'globe', variant: 'dim', label: null },
	},
	startup: {
		done: false,
		steps: [
			{ id: 'daemon', icon: 'circle-outline', variant: 'neutral', label: 'Daemon', detail: '' },
			{ id: 'stores', icon: 'circle-outline', variant: 'neutral', label: 'Data stores', detail: '' },
			{ id: 'settings', icon: 'circle-outline', variant: 'neutral', label: 'Settings', detail: '' },
			{ id: 'plugins', icon: 'circle-outline', variant: 'neutral', label: 'Plugins', detail: '' },
		],
	},
};
