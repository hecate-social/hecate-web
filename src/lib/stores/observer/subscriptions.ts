// Observer: PG groups / subscriptions

import { get } from '$lib/api';

export interface SubscriptionGroup {
	group: string;
	member_count: number;
	members: Array<{
		pid: string;
		alive: boolean;
		registered_name: string | null;
		initial_call: string | null;
	}>;
}

export async function fetchSubscriptions() {
	return get<{ items: SubscriptionGroup[]; total: number }>('/api/observer/subscriptions');
}
