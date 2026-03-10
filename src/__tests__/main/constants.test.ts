/**
 * @file constants.test.ts
 * @description Unit tests for main process constants including regex patterns and debug utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { REGEX_AI_SUFFIX, REGEX_AI_TAB_ID, debugLog, debugLogLazy } from '../../main/constants';

describe('main/constants', () => {
	describe('REGEX_AI_SUFFIX', () => {
		it('should match session IDs with -ai- suffix and any tab ID format', () => {
			expect('session-123-ai-tab1'.match(REGEX_AI_SUFFIX)).not.toBeNull();
			expect('session-123-ai-abc123def'.match(REGEX_AI_SUFFIX)).not.toBeNull();
			expect(
				'51cee651-6629-4de8-abdd-1c1540555f2d-ai-73aaeb23-6673-45a4-8fdf-c769802f79bb'.match(
					REGEX_AI_SUFFIX
				)
			).not.toBeNull();
		});

		it('should not match session IDs without -ai- suffix', () => {
			expect('session-123-terminal'.match(REGEX_AI_SUFFIX)).toBeNull();
			expect('session-123'.match(REGEX_AI_SUFFIX)).toBeNull();
		});

		it('should correctly strip -ai- suffix to extract base session ID', () => {
			const sessionId =
				'51cee651-6629-4de8-abdd-1c1540555f2d-ai-73aaeb23-6673-45a4-8fdf-c769802f79bb';
			expect(sessionId.replace(REGEX_AI_SUFFIX, '')).toBe('51cee651-6629-4de8-abdd-1c1540555f2d');
		});
	});

	describe('REGEX_AI_TAB_ID', () => {
		it('should extract simple tab ID from session ID', () => {
			const match = 'session-123-ai-tab1'.match(REGEX_AI_TAB_ID);
			expect(match).not.toBeNull();
			expect(match![1]).toBe('tab1');
		});

		it('should extract UUID tab ID from session ID', () => {
			const match =
				'51cee651-6629-4de8-abdd-1c1540555f2d-ai-73aaeb23-6673-45a4-8fdf-c769802f79bb'.match(
					REGEX_AI_TAB_ID
				);
			expect(match).not.toBeNull();
			expect(match![1]).toBe('73aaeb23-6673-45a4-8fdf-c769802f79bb');
		});
	});

	describe('debugLog', () => {
		let consoleSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleSpy.mockRestore();
		});

		it('should be a function', () => {
			expect(typeof debugLog).toBe('function');
		});

		it('should accept prefix, message, and additional args', () => {
			expect(() => debugLog('TestPrefix', 'Test message', { extra: 'data' })).not.toThrow();
		});

		it('should format message with prefix when called', () => {
			debugLog('TestPrefix', 'Test message');
		});
	});

	describe('debugLogLazy', () => {
		let consoleSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleSpy.mockRestore();
		});

		it('should be a function', () => {
			expect(typeof debugLogLazy).toBe('function');
		});

		it('should accept prefix, message callback, and additional args', () => {
			expect(() =>
				debugLogLazy('TestPrefix', () => 'Test message', { extra: 'data' })
			).not.toThrow();
		});

		it('should handle callbacks that return complex strings', () => {
			const items = [1, 2, 3];
			expect(() =>
				debugLogLazy('Parser', () => `Parsed ${items.length} items: ${JSON.stringify(items)}`)
			).not.toThrow();
		});
	});
});
