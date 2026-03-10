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

export type ListingStatus = 'draft' | 'announced' | 'published' | 'retracted' | 'archived';

const LISTING_STATUS_MAP: Record<string, ListingStatus> = {
	Initiated: 'draft',
	Announced: 'announced',
	Published: 'published',
	Retracted: 'retracted',
	Archived: 'archived'
};

export function getListingStatus(
	status: number,
	statusLabel?: string | null
): ListingStatus {
	if (statusLabel && statusLabel in LISTING_STATUS_MAP) {
		return LISTING_STATUS_MAP[statusLabel];
	}
	if (status & 32) return 'archived';
	if (status & 4) return 'published';
	if (status & 2) return 'announced';
	return 'draft';
}

export interface OfferingDetail extends OfferingItem {
	license: License | null;
}

export type ActionState = 'get' | 'install' | 'installed' | 'update' | 'revoked' | 'loading';

const INSTALLED_LABELS = new Set([
	'Installed',
	'Running',
	'Starting',
	'Downloading',
	'Ready',
	'Stopped'
]);

export function isPluginInstalled(item: OfferingItem): boolean {
	return item.status_label != null && INSTALLED_LABELS.has(item.status_label);
}

export function getActionState(item: OfferingItem): ActionState {
	if (isPluginInstalled(item)) {
		if (item.installed_version && item.version !== item.installed_version) return 'update';
		return 'installed';
	}
	if (!item.license_id) return 'get';
	return 'install';
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
