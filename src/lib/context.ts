// StudioContext — shared API contract for built-in and mesh studios

import * as api from './api.js';
import type { DaemonHealth, LLMHealth, StreamChunk } from './types.js';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface StudioContext {
	api: {
		get<T>(path: string): Promise<T>;
		post<T>(path: string, body: unknown): Promise<T>;
		del<T>(path: string): Promise<T>;
	};
	stream: {
		chat(
			model: string,
			messages: Array<{ role: string; content: string }>,
			opts?: { temperature?: number; max_tokens?: number; tools?: unknown[] }
		): ChatStream;
	};
}

export interface ChatStream {
	onChunk(fn: (chunk: StreamChunk) => void): ChatStream;
	onDone(fn: (chunk: StreamChunk) => void): ChatStream;
	onError(fn: (error: string) => void): ChatStream;
	start(): Promise<void>;
	cancel(): void;
}

export function createStudioContext(): StudioContext {
	return {
		api: {
			get: api.get,
			post: api.post,
			del: api.del
		},
		stream: {
			chat(model, messages, opts) {
				return createChatStream(model, messages, opts);
			}
		}
	};
}

function createChatStream(
	model: string,
	messages: Array<{ role: string; content: string }>,
	opts?: { temperature?: number; max_tokens?: number; tools?: unknown[] }
): ChatStream {
	const streamId = crypto.randomUUID();
	let chunkHandler: ((chunk: StreamChunk) => void) | null = null;
	let doneHandler: ((chunk: StreamChunk) => void) | null = null;
	let errorHandler: ((error: string) => void) | null = null;
	const unlisteners: UnlistenFn[] = [];
	let cancelled = false;

	const stream: ChatStream = {
		onChunk(fn) {
			chunkHandler = fn;
			return stream;
		},
		onDone(fn) {
			doneHandler = fn;
			return stream;
		},
		onError(fn) {
			errorHandler = fn;
			return stream;
		},
		async start() {
			if (cancelled) return;

			// Listen for chunk events
			const unChunk = await listen<StreamChunk>(`chat-chunk-${streamId}`, (event) => {
				if (!cancelled && chunkHandler) {
					chunkHandler(event.payload);
				}
			});
			unlisteners.push(unChunk);

			// Listen for done events
			const unDone = await listen<StreamChunk>(`chat-done-${streamId}`, (event) => {
				if (!cancelled && doneHandler) {
					doneHandler(event.payload);
				}
				cleanup();
			});
			unlisteners.push(unDone);

			// Listen for error events
			const unError = await listen<StreamChunk>(`chat-error-${streamId}`, (event) => {
				if (!cancelled && errorHandler) {
					errorHandler(event.payload.error || 'Unknown streaming error');
				}
				cleanup();
			});
			unlisteners.push(unError);

			// Invoke the Rust command
			try {
				await invoke('chat_stream', {
					streamId,
					model,
					messages,
					temperature: opts?.temperature ?? null,
					maxTokens: opts?.max_tokens ?? null,
					tools: opts?.tools ?? null
				});
			} catch (e) {
				if (errorHandler) {
					errorHandler(String(e));
				}
				cleanup();
			}
		},
		cancel() {
			cancelled = true;
			cleanup();
		}
	};

	function cleanup() {
		for (const un of unlisteners) {
			un();
		}
		unlisteners.length = 0;
	}

	return stream;
}
