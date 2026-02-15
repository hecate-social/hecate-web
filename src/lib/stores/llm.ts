import { writable, get } from 'svelte/store';
import type { ChatMessage, Model, StreamChunk, Usage } from '../types.js';
import type { ChatStream } from '../context.js';
import * as api from '../api.js';
import { createStudioContext } from '../context.js';
import { systemPrompt } from './personality.js';

export const models = writable<Model[]>([]);
export const selectedModel = writable<string>('');
export const messages = writable<ChatMessage[]>([]);
export const isStreaming = writable(false);
export const streamingContent = writable('');
export const lastUsage = writable<Usage | null>(null);
export const streamError = writable<string | null>(null);

const ctx = createStudioContext();
let activeStream: ChatStream | null = null;

// When the model changes, cancel any in-flight stream and reset conversation
let prevModel: string | null = null;
selectedModel.subscribe((model) => {
	if (prevModel !== null && prevModel !== model) {
		if (activeStream) {
			activeStream.cancel();
			activeStream = null;
		}
		messages.set([]);
		streamingContent.set('');
		isStreaming.set(false);
		lastUsage.set(null);
		streamError.set(null);
	}
	prevModel = model;
});

export async function fetchModels(): Promise<void> {
	try {
		const resp = await api.get<{ ok: boolean; models: Model[] }>('/api/llm/models');
		if (resp.ok && resp.models) {
			// Always prefer local (Ollama) models — self-hosted, no API keys needed
			const ollama = resp.models.find((m) => m.provider === 'ollama');
			const preferred = ollama ? ollama.name : resp.models[0]?.name ?? '';
			models.set(resp.models);
			if (preferred) selectedModel.set(preferred);
		}
	} catch {
		models.set([]);
	}
}

export function clearChat(): void {
	messages.set([]);
	streamingContent.set('');
	lastUsage.set(null);
	streamError.set(null);
}

export async function sendMessage(content: string): Promise<void> {
	const model = get(selectedModel);
	if (!model || !content.trim()) return;

	// Add user message
	const userMsg: ChatMessage = { role: 'user', content: content.trim() };
	messages.update((msgs) => [...msgs, userMsg]);

	// Prepare messages for API — inject system prompt if personality is active
	const sysPrompt = get(systemPrompt);
	const allMessages: ChatMessage[] = [];
	if (sysPrompt) {
		allMessages.push({ role: 'system', content: sysPrompt });
	}
	allMessages.push(...get(messages));

	isStreaming.set(true);
	streamingContent.set('');
	streamError.set(null);
	lastUsage.set(null);

	let accumulated = '';
	let receivedAnyEvent = false;

	const stream = ctx.stream.chat(model, allMessages);
	activeStream = stream;

	// Safety timeout: if no events arrive within 45 seconds, abort
	const timeout = setTimeout(() => {
		if (get(isStreaming) && !receivedAnyEvent) {
			console.warn('[llm] stream timeout — no events received in 45s');
			stream.cancel();
			finishWithError('Stream timeout — no response from daemon. Check daemon logs.');
		}
	}, 45000);

	function finishWithError(error: string) {
		clearTimeout(timeout);
		activeStream = null;
		const errorMsg: ChatMessage = {
			role: 'assistant',
			content: `Error: ${error}`
		};
		messages.update((msgs) => [...msgs, errorMsg]);
		streamingContent.set('');
		streamError.set(error);
		isStreaming.set(false);
	}

	stream
		.onChunk((chunk: StreamChunk) => {
			receivedAnyEvent = true;
			if (chunk.content) {
				accumulated += chunk.content;
				streamingContent.set(accumulated);
			}
		})
		.onDone((chunk: StreamChunk) => {
			receivedAnyEvent = true;
			clearTimeout(timeout);
			activeStream = null;

			if (chunk.content) {
				accumulated += chunk.content;
			}
			// Add assistant message to history
			const assistantMsg: ChatMessage = {
				role: 'assistant',
				content: accumulated || '(empty response)'
			};
			messages.update((msgs) => [...msgs, assistantMsg]);
			streamingContent.set('');
			isStreaming.set(false);

			if (chunk.usage) {
				lastUsage.set(chunk.usage);
			}
		})
		.onError((error: string) => {
			receivedAnyEvent = true;
			clearTimeout(timeout);
			console.error('[llm] stream error:', error);
			finishWithError(error);
		});

	try {
		await stream.start();
		console.log('[llm] stream.start() resolved (thread spawned)');
	} catch (e) {
		clearTimeout(timeout);
		console.error('[llm] stream.start() rejected:', e);
		finishWithError(String(e));
	}
}
