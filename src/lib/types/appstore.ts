export interface CatalogItem {
	plugin_id: string;
	name: string;
	org: string;
	version: string;
	description: string | null;
	icon: string | null;
	oci_image: string;
	manifest_tag: string | null;
	tags: string | null;
	homepage: string | null;
	min_daemon_version: string | null;
	publisher_identity: string | null;
	selling_formula: string | null;
	license_type: string | null;
	fee_cents: number | null;
	fee_currency: string | null;
	duration_days: number | null;
	node_limit: number | null;
	published_at: number | null;
	cataloged_at: number;
	refreshed_at: number | null;
	status: number;
	retracted: number;
	license_id: string | null;
	installed: number | null;
	installed_version: string | null;
}

export interface License {
	license_id: string;
	user_id: string;
	plugin_id: string;
	plugin_name: string | null;
	installed: number;
	installed_version: string | null;
	oci_image: string | null;
	granted_at: number;
	installed_at: number | null;
	upgraded_at: number | null;
	revoked: number;
	revoked_at: number | null;
}

export interface SellerListing extends CatalogItem {
	seller_id: string;
	github_repo: string | null;
	announced_at: number | null;
	status_label: string | null;
}

export type ListingStatus = 'draft' | 'announced' | 'published' | 'retracted';

export function getListingStatus(status: number, retracted: number): ListingStatus {
	if (retracted) return 'retracted';
	if (status & 4) return 'published';
	if (status & 2) return 'announced';
	return 'draft';
}

export interface PluginDetail extends CatalogItem {
	license: License | null;
}

export type ActionState = 'get' | 'install' | 'installed' | 'update' | 'revoked' | 'loading';

export function getActionState(item: CatalogItem): ActionState {
	if (!item.license_id) return 'get';
	if (item.installed === 1) {
		if (item.installed_version && item.version !== item.installed_version) return 'update';
		return 'installed';
	}
	return 'install';
}

export function formatPrice(item: CatalogItem): string {
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

export function parseTags(tagsJson: string | null): string[] {
	if (!tagsJson) return [];
	try {
		return JSON.parse(tagsJson);
	} catch {
		return [];
	}
}
