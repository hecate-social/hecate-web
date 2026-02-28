import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock svelte/store before importing api module
const mockSettings = { subscribe: vi.fn() };
let settingsValue: unknown = null;

vi.mock('svelte/store', () => ({
	get: () => settingsValue,
	writable: () => mockSettings
}));

vi.mock('$lib/stores/settings', () => ({
	settings: mockSettings
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Now import the module under test
const { get, post, put, del, patch, ApiError } = await import('./api');

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		headers: { 'Content-Type': 'application/json' }
	});
}

function textResponse(text: string, status: number): Response {
	return new Response(text, {
		status,
		statusText: 'Error'
	});
}

beforeEach(() => {
	mockFetch.mockReset();
	settingsValue = null;
});

// --- Auth headers ---

describe('auth headers', () => {
	it('sends X-Hecate-User-Id when settings has identity', async () => {
		settingsValue = { identity: { hecate_user_id: 'user-abc-123' } };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await get('/api/test');

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers['X-Hecate-User-Id']).toBe('user-abc-123');
	});

	it('omits X-Hecate-User-Id when settings is null', async () => {
		settingsValue = null;
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await get('/api/test');

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers['X-Hecate-User-Id']).toBeUndefined();
	});

	it('omits X-Hecate-User-Id when identity is missing', async () => {
		settingsValue = { identity: null };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await get('/api/test');

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers['X-Hecate-User-Id']).toBeUndefined();
	});

	it('omits X-Hecate-User-Id when hecate_user_id is empty', async () => {
		settingsValue = { identity: { hecate_user_id: '' } };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await get('/api/test');

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers['X-Hecate-User-Id']).toBeUndefined();
	});
});

// --- GET ---

describe('get', () => {
	it('fetches from hecate://localhost with path', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ items: [1, 2] }));

		const result = await get('/api/catalog');

		expect(mockFetch).toHaveBeenCalledOnce();
		expect(mockFetch.mock.calls[0][0]).toBe('hecate://localhost/api/catalog');
		expect(result).toEqual({ items: [1, 2] });
	});

	it('does not send a body or method', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({}));

		await get('/api/test');

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.method).toBeUndefined();
		expect(opts.body).toBeUndefined();
	});
});

// --- POST ---

describe('post', () => {
	it('sends POST with JSON body and Content-Type', async () => {
		settingsValue = { identity: { hecate_user_id: 'u1' } };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await post('/api/licenses', { name: 'test' });

		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe('hecate://localhost/api/licenses');
		expect(opts.method).toBe('POST');
		expect(opts.headers['Content-Type']).toBe('application/json');
		expect(opts.headers['X-Hecate-User-Id']).toBe('u1');
		expect(opts.body).toBe(JSON.stringify({ name: 'test' }));
	});
});

// --- PUT ---

describe('put', () => {
	it('sends PUT with JSON body', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await put('/api/settings/preferences', { theme: 'dark' });

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.method).toBe('PUT');
		expect(opts.headers['Content-Type']).toBe('application/json');
		expect(opts.body).toBe(JSON.stringify({ theme: 'dark' }));
	});
});

// --- DELETE ---

describe('del', () => {
	it('sends DELETE with auth headers', async () => {
		settingsValue = { identity: { hecate_user_id: 'u2' } };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await del('/api/plugins/weather');

		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe('hecate://localhost/api/plugins/weather');
		expect(opts.method).toBe('DELETE');
		expect(opts.headers['X-Hecate-User-Id']).toBe('u2');
	});
});

// --- PATCH ---

describe('patch', () => {
	it('sends PATCH with JSON body', async () => {
		settingsValue = { identity: { hecate_user_id: 'u3' } };
		mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

		await patch('/api/appstore/licenses/lic-1/pricing', { fee_cents: 499 });

		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe('hecate://localhost/api/appstore/licenses/lic-1/pricing');
		expect(opts.method).toBe('PATCH');
		expect(opts.headers['Content-Type']).toBe('application/json');
		expect(opts.headers['X-Hecate-User-Id']).toBe('u3');
		expect(opts.body).toBe(JSON.stringify({ fee_cents: 499 }));
	});
});

// --- Error handling ---

describe('error handling', () => {
	it('throws ApiError with code from JSON error body', async () => {
		mockFetch.mockResolvedValueOnce(
			textResponse(JSON.stringify({ error: 'missing_user_id' }), 401)
		);

		await expect(get('/api/catalog')).rejects.toThrow(ApiError);

		try {
			mockFetch.mockResolvedValueOnce(
				textResponse(JSON.stringify({ error: 'missing_user_id' }), 401)
			);
			await get('/api/catalog');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			const err = e as InstanceType<typeof ApiError>;
			expect(err.status).toBe(401);
			expect(err.code).toBe('missing_user_id');
			expect(err.message).toBe('missing user id');
		}
	});

	it('throws ApiError with plain text body', async () => {
		mockFetch.mockResolvedValueOnce(textResponse('Not Found', 404));

		try {
			await get('/api/nonexistent');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			const err = e as InstanceType<typeof ApiError>;
			expect(err.status).toBe(404);
			expect(err.code).toBeNull();
			expect(err.message).toBe('Not Found');
		}
	});

	it('throws ApiError with statusText when body is empty', async () => {
		mockFetch.mockResolvedValueOnce(textResponse('', 500));

		try {
			await get('/api/broken');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			const err = e as InstanceType<typeof ApiError>;
			expect(err.status).toBe(500);
			expect(err.code).toBeNull();
			expect(err.message).toBe('Error');
		}
	});

	it('replaces underscores with spaces in error code message', async () => {
		mockFetch.mockResolvedValueOnce(
			textResponse(JSON.stringify({ error: 'license_not_found' }), 404)
		);

		try {
			await get('/api/test');
		} catch (e) {
			const err = e as InstanceType<typeof ApiError>;
			expect(err.message).toBe('license not found');
		}
	});

	it('does not throw for 2xx responses', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'ok' }));

		const result = await get('/api/ok');
		expect(result).toEqual({ data: 'ok' });
	});
});
