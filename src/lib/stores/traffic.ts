import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

interface TrafficCounters {
	tx_bytes: number;
	rx_bytes: number;
	tx_count: number;
	rx_count: number;
}

export const txActive = writable(false);
export const rxActive = writable(false);
export const txBytes = writable(0);
export const rxBytes = writable(0);

const POLL_MS = 1_000;
const FADE_MS = 300;

let timer: ReturnType<typeof setInterval> | null = null;
let txFade: ReturnType<typeof setTimeout> | null = null;
let rxFade: ReturnType<typeof setTimeout> | null = null;
let prevTx = 0;
let prevRx = 0;

async function poll() {
	try {
		const c = await invoke<TrafficCounters>('get_traffic_counters');
		txBytes.set(c.tx_bytes);
		rxBytes.set(c.rx_bytes);

		if (c.tx_count > prevTx) {
			txActive.set(true);
			if (txFade) clearTimeout(txFade);
			txFade = setTimeout(() => txActive.set(false), FADE_MS);
		}
		if (c.rx_count > prevRx) {
			rxActive.set(true);
			if (rxFade) clearTimeout(rxFade);
			rxFade = setTimeout(() => rxActive.set(false), FADE_MS);
		}

		prevTx = c.tx_count;
		prevRx = c.rx_count;
	} catch {
		// Tauri command not available yet — ignore
	}
}

export function startTrafficWatcher() {
	stopTrafficWatcher();
	timer = setInterval(poll, POLL_MS);
	poll();
}

export function stopTrafficWatcher() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	if (txFade) clearTimeout(txFade);
	if (rxFade) clearTimeout(rxFade);
}
