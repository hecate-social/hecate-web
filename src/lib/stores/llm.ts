import { writable, get } from 'svelte/store';
import { get as apiGet, post } from '$lib/api';
import type { ChatMessage, Model, ModelsResponse, ChatResponse, Usage } from '$lib/types/llm';

export const models = writable<Model[]>([]);
export const selectedModel = writable<string>('');
export const messages = writable<ChatMessage[]>([]);
export const isStreaming = writable(false);
export const streamingContent = writable('');
export const lastUsage = writable<Usage | null>(null);
export const streamError = writable<string | null>(null);

let prevModel: string | null = null;
selectedModel.subscribe((model) => {
	if (prevModel !== null && prevModel !== model) {
		messages.set([]);
		streamingContent.set('');
		isStreaming.set(false);
		lastUsage.set(null);
		streamError.set(null);
	}
	prevModel = model;
});

const PREFERRED_CLOUD_MODEL = 'llama-3.3-70b-versatile';
const MIN_LOCAL_PARAMS_B = 20;

function parseParamBillions(s?: string): number {
	if (!s) return 0;
	const m = s.match(/^(\d+(?:\.\d+)?)\s*[Bb]/);
	return m ? parseFloat(m[1]) : 0;
}

function selectBestModel(available: Model[]): string {
	const local = available.filter((m) => m.provider === 'ollama');
	const capable = local.filter((m) => parseParamBillions(m.parameter_size) >= MIN_LOCAL_PARAMS_B);
	if (capable.length > 0) {
		const best = [...capable].sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0));
		return best[0].name;
	}
	const cloud = available.find((m) => m.name === PREFERRED_CLOUD_MODEL);
	if (cloud) return cloud.name;
	if (local.length > 0) return local[0].name;
	return available[0]?.name ?? '';
}

let fetchRetries = 0;

export async function fetchModels(): Promise<void> {
	try {
		const resp = await apiGet<ModelsResponse>('/api/llm/models');
		if (resp.ok && resp.models) {
			models.set(resp.models);
			const best = selectBestModel(resp.models);
			if (best) selectedModel.set(best);

			const hasPreferred = resp.models.some((m) => m.name === PREFERRED_CLOUD_MODEL);
			if (!hasPreferred && fetchRetries < 5) {
				fetchRetries++;
				setTimeout(() => fetchModels(), 3000);
			}
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

	const userMsg: ChatMessage = { role: 'user', content: content.trim() };
	messages.update((msgs) => [...msgs, userMsg]);

	const allMessages: ChatMessage[] = [...get(messages)];

	isStreaming.set(true);
	streamingContent.set('');
	streamError.set(null);
	lastUsage.set(null);

	try {
		const resp = await post<ChatResponse>('/api/llm/chat', {
			model,
			messages: allMessages
		});

		if (resp.ok && resp.content) {
			const assistantMsg: ChatMessage = {
				role: 'assistant',
				content: resp.content
			};
			messages.update((msgs) => [...msgs, assistantMsg]);
			if (resp.usage) lastUsage.set(resp.usage);
		} else {
			const errorMsg: ChatMessage = {
				role: 'assistant',
				content: `Error: ${resp.error ?? 'Unknown error'}`
			};
			messages.update((msgs) => [...msgs, errorMsg]);
			streamError.set(resp.error ?? 'Unknown error');
		}
	} catch (e) {
		const errorStr = e instanceof Error ? e.message : String(e);
		const errorMsg: ChatMessage = {
			role: 'assistant',
			content: `Error: ${errorStr}`
		};
		messages.update((msgs) => [...msgs, errorMsg]);
		streamError.set(errorStr);
	} finally {
		streamingContent.set('');
		isStreaming.set(false);
	}
}
