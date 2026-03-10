/**
 * Tests for sessionIdParser utility.
 * Validates session ID parsing with pre-compiled regex patterns.
 */

import { describe, it, expect } from 'vitest';
import {
	parseSessionId,
	isSynopsisSession,
	isBatchSession,
	getBaseSessionId,
	getTabId,
	REGEX_AI_TAB,
	REGEX_SYNOPSIS,
	REGEX_BATCH,
} from '../sessionIdParser';

describe('sessionIdParser', () => {
	describe('parseSessionId', () => {
		it('should parse AI tab session IDs', () => {
			const result = parseSessionId('session-123-ai-tab1');
			expect(result).toEqual({
				actualSessionId: 'session-123',
				tabId: 'tab1',
				baseSessionId: 'session-123',
				type: 'ai-tab',
			});
		});

		it('should parse AI tab session with complex session ID', () => {
			const result = parseSessionId('my-app-session-uuid-ai-main-tab');
			expect(result).toEqual({
				actualSessionId: 'my-app-session-uuid',
				tabId: 'main-tab',
				baseSessionId: 'my-app-session-uuid',
				type: 'ai-tab',
			});
		});

		it('should parse legacy AI session IDs', () => {
			const result = parseSessionId('session-123-ai');
			expect(result).toEqual({
				actualSessionId: 'session-123',
				tabId: null,
				baseSessionId: 'session-123',
				type: 'legacy-ai',
			});
		});

		it('should parse synopsis session IDs', () => {
			const result = parseSessionId('session-123-synopsis-1704067200000');
			expect(result).toEqual({
				actualSessionId: 'session-123-synopsis-1704067200000',
				tabId: null,
				baseSessionId: 'session-123',
				type: 'synopsis',
			});
		});

		it('should parse batch session IDs', () => {
			const result = parseSessionId('session-123-batch-1704067200000');
			expect(result).toEqual({
				actualSessionId: 'session-123-batch-1704067200000',
				tabId: null,
				baseSessionId: 'session-123',
				type: 'batch',
			});
		});

		it('should parse regular session IDs', () => {
			const result = parseSessionId('session-123');
			expect(result).toEqual({
				actualSessionId: 'session-123',
				tabId: null,
				baseSessionId: 'session-123',
				type: 'regular',
			});
		});

		it('should handle UUID-style session IDs', () => {
			const uuid = '550e8400-e29b-41d4-a716-446655440000';
			const result = parseSessionId(`${uuid}-ai-default`);
			expect(result).toEqual({
				actualSessionId: uuid,
				tabId: 'default',
				baseSessionId: uuid,
				type: 'ai-tab',
			});
		});
	});

	describe('helper functions', () => {
		describe('isSynopsisSession', () => {
			it('should return true for synopsis sessions', () => {
				expect(isSynopsisSession('session-123-synopsis-1234567890')).toBe(true);
			});

			it('should return false for non-synopsis sessions', () => {
				expect(isSynopsisSession('session-123-ai-tab1')).toBe(false);
				expect(isSynopsisSession('session-123')).toBe(false);
				expect(isSynopsisSession('session-123-batch-1234567890')).toBe(false);
			});
		});

		describe('isBatchSession', () => {
			it('should return true for batch sessions', () => {
				expect(isBatchSession('session-123-batch-1234567890')).toBe(true);
			});

			it('should return false for non-batch sessions', () => {
				expect(isBatchSession('session-123-ai-tab1')).toBe(false);
				expect(isBatchSession('session-123')).toBe(false);
				expect(isBatchSession('session-123-synopsis-1234567890')).toBe(false);
			});

			it('should not match false positives with batch in UUID', () => {
				expect(isBatchSession('session-batch-uuid-ai-tab1')).toBe(false);
			});
		});

		describe('getBaseSessionId', () => {
			it('should extract base session ID from any format', () => {
				expect(getBaseSessionId('session-123-ai-tab1')).toBe('session-123');
				expect(getBaseSessionId('session-123-ai')).toBe('session-123');
				expect(getBaseSessionId('session-123-synopsis-1234567890')).toBe('session-123');
				expect(getBaseSessionId('session-123-batch-1234567890')).toBe('session-123');
				expect(getBaseSessionId('session-123')).toBe('session-123');
			});
		});

		describe('getTabId', () => {
			it('should extract tab ID from AI tab sessions', () => {
				expect(getTabId('session-123-ai-tab1')).toBe('tab1');
				expect(getTabId('session-123-ai-main-tab')).toBe('main-tab');
			});

			it('should return null for non-AI-tab sessions', () => {
				expect(getTabId('session-123-ai')).toBe(null);
				expect(getTabId('session-123')).toBe(null);
				expect(getTabId('session-123-synopsis-1234567890')).toBe(null);
			});
		});
	});

	describe('regex patterns', () => {
		it('REGEX_AI_TAB should match AI tab format', () => {
			expect('session-ai-tab'.match(REGEX_AI_TAB)).toBeTruthy();
			expect('session-123-ai-tab1'.match(REGEX_AI_TAB)).toBeTruthy();
			expect('session-ai'.match(REGEX_AI_TAB)).toBeFalsy();
		});

		it('REGEX_SYNOPSIS should match synopsis format', () => {
			expect('session-synopsis-123'.match(REGEX_SYNOPSIS)).toBeTruthy();
			expect('session-123-synopsis-1234567890'.match(REGEX_SYNOPSIS)).toBeTruthy();
			expect('session-synopsis'.match(REGEX_SYNOPSIS)).toBeFalsy();
		});

		it('REGEX_BATCH should match batch format', () => {
			expect('session-batch-123'.match(REGEX_BATCH)).toBeTruthy();
			expect('session-123-batch-1234567890'.match(REGEX_BATCH)).toBeTruthy();
			expect('session-batch'.match(REGEX_BATCH)).toBeFalsy();
		});
	});
});
