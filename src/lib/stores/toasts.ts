import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	dismissible: boolean;
}

const MAX_TOASTS = 5;
const DURATIONS: Record<ToastType, number> = {
	success: 4000,
	info: 4000,
	warning: 6000,
	error: 8000
};

export const toasts = writable<Toast[]>([]);

let counter = 0;

function addToast(message: string, type: ToastType, duration?: number): string {
	const id = `toast-${++counter}`;
	const toast: Toast = {
		id,
		message,
		type,
		duration: duration ?? DURATIONS[type],
		dismissible: true
	};

	toasts.update((all) => {
		const next = [...all, toast];
		return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
	});

	if (toast.duration > 0) {
		setTimeout(() => dismissToast(id), toast.duration);
	}

	return id;
}

export function dismissToast(id: string): void {
	toasts.update((all) => all.filter((t) => t.id !== id));
}

export const toastSuccess = (msg: string, duration?: number) => addToast(msg, 'success', duration);
export const toastError = (msg: string, duration?: number) => addToast(msg, 'error', duration);
export const toastInfo = (msg: string, duration?: number) => addToast(msg, 'info', duration);
export const toastWarning = (msg: string, duration?: number) => addToast(msg, 'warning', duration);
