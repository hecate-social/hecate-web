// SSE event stream client — connects to /api/events for real-time daemon updates.
//
// Replaces polling for plugin status changes. The daemon broadcasts
// domain events via hecate_web_events, which streams them as SSE.

import { writable, get } from 'svelte/store';
import { isTauri } from '$lib/tauri';

const BASE = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';

export type EventStreamStatus = 'disconnected' | 'connecting' | 'connected';

export const eventStreamStatus = writable<EventStreamStatus>('disconnected');

type EventHandler = (data: unknown) => void;

const handlers = new Map<string, Set<EventHandler>>();
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const RECONNECT_MS = 3000;

/** Register a handler for a specific SSE event type. Returns an unsubscribe function. */
export function onDaemonEvent(eventType: string, handler: EventHandler): () => void {
	let set = handlers.get(eventType);
	if (!set) {
		set = new Set();
		handlers.set(eventType, set);
	}
	set.add(handler);

	// If already connected, attach listener to existing source
	if (source) {
		source.addEventListener(eventType, makeListener(handler));
	}

	return () => {
		set!.delete(handler);
		if (set!.size === 0) handlers.delete(eventType);
	};
}

function makeListener(handler: EventHandler): (e: Event) => void {
	return (e: Event) => {
		const me = e as MessageEvent;
		try {
			const data = JSON.parse(me.data);
			handler(data);
		} catch {
			handler(me.data);
		}
	};
}

/** Connect to the daemon SSE endpoint. Automatically reconnects on failure. */
export function startEventStream(): void {
	if (source) return;

	eventStreamStatus.set('connecting');

	source = new EventSource(`${BASE}/api/events`);

	source.onopen = () => {
		eventStreamStatus.set('connected');
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	};

	source.onerror = () => {
		cleanup();
		eventStreamStatus.set('disconnected');
		scheduleReconnect();
	};

	// Attach all registered handlers to the new source
	for (const [eventType, handlerSet] of handlers) {
		for (const handler of handlerSet) {
			source.addEventListener(eventType, makeListener(handler));
		}
	}
}

/** Disconnect from the SSE endpoint. */
export function stopEventStream(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	cleanup();
	eventStreamStatus.set('disconnected');
}

function cleanup(): void {
	if (source) {
		source.close();
		source = null;
	}
}

function scheduleReconnect(): void {
	if (reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (get(eventStreamStatus) === 'disconnected') {
			startEventStream();
		}
	}, RECONNECT_MS);
}
