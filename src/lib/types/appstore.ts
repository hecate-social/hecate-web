export interface OfferingItem {
	plugin_id: string;
	offering_id: string;
	name: string;
	org: string;
	version: string;
	description: string | null;
	icon: string | null;
	group_name: string | null;
	group_icon: string | null;
	oci_image: string | null;
	package_url: string | null;
	plugin_type: string | null;
	callback_module: string | null;
	manifest_tag: string | null;
	tags: string | null;
	homepage: string | null;
	min_daemon_version: string | null;
	author_id: string | null;
	publisher_identity: string | null;
	selling_formula: string | null;
	license_type: string | null;
	fee_cents: number | null;
	fee_currency: string | null;
	duration_days: number | null;
	node_limit: number | null;
	manifest_url: string | null;
	manifest_checksum: string | null;
	author_signature: string | null;
	oci_image_verified: number | null;
	oci_image_digest: string | null;
	published_at: number | null;
	cataloged_at: number;
	refreshed_at: number | null;
	status: number;
	status_label: string | null;
	available_actions: string[];
	// Enriched by consumer license read model
	license_id: string | null;
	installed: number | null;
	installed_version: string | null;
}

export interface License {
	license_id: string;
	consumer_id: string;
	plugin_id: string;
	offering_id: string;
	plugin_name: string | null;
	status: number;
	status_label: string | null;
	available_actions: string[];
	oci_image: string | null;
	package_url: string | null;
	installed_version: string | null;
	initiated_at: number | null;
	accepted_at: number | null;
	bought_at: number | null;
	granted_at: number | null;
	expired_at: number | null;
	revoked_at: number | null;
	archived_at: number | null;
}

export interface AuthorListing extends OfferingItem {
	author_id: string;
	github_repo: string | null;
	announced_at: number | null;
}

export interface OfferingDetail extends OfferingItem {
	license: License | null;
}

export type ActionState = 'get' | 'install' | 'installed' | 'update' | 'revoked' | 'loading';

export function getActionState(item: OfferingItem): ActionState {
	// Removed plugins should show as installable, regardless of stale available_actions
	if (item.status_label === 'Removed') {
		return item.license_id ? 'install' : 'get';
	}
	const actions = item.available_actions ?? [];
	// Plugin is installed and operational (can be stopped/upgraded/removed)
	if (actions.includes('stop') || actions.includes('remove')) {
		if (item.installed_version && item.version !== item.installed_version) return 'update';
		return 'installed';
	}
	// Plugin is installed but stopped (can be started)
	if (actions.includes('start')) {
		if (item.installed_version && item.version !== item.installed_version) return 'update';
		return 'installed';
	}
	// Plugin can be installed (has license or action says "install")
	if (actions.includes('install')) return 'install';
	// No license yet — needs to be acquired first
	if (!item.license_id) return 'get';
	return 'install';
}

export function isPluginInstalled(item: OfferingItem): boolean {
	if (item.status_label === 'Removed') return false;
	const actions = item.available_actions ?? [];
	return actions.includes('stop') || actions.includes('start') || actions.includes('remove') || actions.includes('upgrade');
}

/** Derive status badge CSS class from available_actions.
 *  - actions includes "stop" -> running (green)
 *  - actions includes "start" -> stopped (yellow)
 *  - actions includes "remove" but not "stop"/"start" -> installed (blue)
 *  - otherwise -> pending/neutral (gray)
 */
export function statusBadgeClass(actions: string[]): string {
	if (actions.includes('stop')) return 'bg-success-500/20 text-success-400';
	if (actions.includes('start')) return 'bg-warning-500/20 text-warning-400';
	if (actions.includes('remove')) return 'bg-accent-500/20 text-accent-400';
	return 'bg-surface-500/20 text-surface-400';
}

/** Map a listing lifecycle action name to button styling. */
const ACTION_BUTTON_STYLES: Record<string, string> = {
	announce: 'bg-accent-600 text-surface-50 hover:bg-accent-500',
	publish: 'bg-success-500 text-surface-50 hover:bg-success-400',
	retract: 'bg-amber-500 text-surface-50 hover:bg-amber-400',
	archive: 'bg-danger-500 text-surface-50 hover:bg-danger-400',
	draft: 'bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600',
	amend: 'bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600'
};

export function actionButtonStyle(action: string): string {
	return ACTION_BUTTON_STYLES[action] ?? 'bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600';
}

/** Human-friendly label for a listing action button. */
export function actionButtonLabel(action: string): string {
	const labels: Record<string, string> = {
		announce: 'Announce',
		publish: 'Publish',
		retract: 'Retract',
		archive: 'Archive',
		draft: 'Draft',
		amend: 'Edit'
	};
	return labels[action] ?? action.charAt(0).toUpperCase() + action.slice(1);
}

export function formatPrice(item: OfferingItem): string {
	if (!item.license_type || item.license_type === 'free' || !item.fee_cents) return 'Free';
	const amount = (item.fee_cents / 100).toFixed(2);
	const currency = item.fee_currency ?? 'EUR';
	const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency;
	if (item.license_type === 'subscription') {
		const period =
			item.duration_days === 365
				? '/yr'
				: item.duration_days === 30
					? '/mo'
					: `/${item.duration_days}d`;
		return `${symbol}${amount}${period}`;
	}
	return `${symbol}${amount}`;
}

/** Derive the plugin routing name from an OCI image ref.
 *  e.g. "ghcr.io/hecate-apps/hecate-app-snake-dueld:latest" -> "snake-duel"
 */
export function extractPluginName(ociImage: string): string {
	// Strip tag (last colon segment, only if no slash after it)
	let base = ociImage;
	const colonIdx = base.lastIndexOf(':');
	if (colonIdx >= 0 && !base.slice(colonIdx + 1).includes('/')) {
		base = base.slice(0, colonIdx);
	}
	// Take last path segment
	const slashIdx = base.lastIndexOf('/');
	let name = slashIdx >= 0 ? base.slice(slashIdx + 1) : base;
	// Strip hecate-app- prefix and d suffix
	if (name.startsWith('hecate-app-')) name = name.slice('hecate-app-'.length);
	if (name.length > 1 && name.endsWith('d')) name = name.slice(0, -1);
	return name;
}

export function parseTags(tagsJson: string | null): string[] {
	if (!tagsJson) return [];
	try {
		return JSON.parse(tagsJson);
	} catch {
		return [];
	}
}
