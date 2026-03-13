/**
 * Tests for smart reply parser — detects actionable options in AI output
 */

import { describe, it, expect } from 'vitest';
import { parseSmartReplies } from '../../../renderer/utils/smartReplyParser';

describe('parseSmartReplies', () => {
	// ========================================================================
	// Numbered options
	// ========================================================================

	describe('numbered options', () => {
		it('should detect numbered options preceded by a question', () => {
			const text = [
				'Which approach do you prefer?',
				'1. Refactor the module',
				'2. Rewrite from scratch',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: '1. Refactor the module', value: '1' },
				{ label: '2. Rewrite from scratch', value: '2' },
			]);
		});

		it('should detect three or more numbered options', () => {
			const text = ['How should we handle this?', '1. Option A', '2. Option B', '3. Option C'].join(
				'\n'
			);

			const result = parseSmartReplies(text);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ label: '1. Option A', value: '1' });
			expect(result[2]).toEqual({ label: '3. Option C', value: '3' });
		});

		it('should handle numbered options with closing paren syntax', () => {
			const text = ['Which one?', '1) First choice', '2) Second choice'].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: '1. First choice', value: '1' },
				{ label: '2. Second choice', value: '2' },
			]);
		});

		it('should not detect a single numbered item (not a choice)', () => {
			const text = ['What do you think?', '1. Only one option'].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toEqual([]);
		});
	});

	// ========================================================================
	// Lettered options
	// ========================================================================

	describe('lettered options', () => {
		it('should detect lettered options with closing paren', () => {
			const text = ['Pick one:', 'Which approach?', 'a) First approach', 'b) Second approach'].join(
				'\n'
			);

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'a. First approach', value: 'a' },
				{ label: 'b. Second approach', value: 'b' },
			]);
		});

		it('should detect lettered options with dot syntax', () => {
			const text = [
				'Which do you prefer?',
				'a. Keep the current implementation',
				'b. Use the new pattern',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('a');
			expect(result[1].value).toBe('b');
		});
	});

	// ========================================================================
	// Yes/No detection
	// ========================================================================

	describe('yes/no questions', () => {
		it('should detect "Would you like me to proceed?"', () => {
			const text = 'I can refactor this module. Would you like me to proceed?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'Yes', value: 'yes' },
				{ label: 'No', value: 'no' },
			]);
		});

		it('should detect "Should I continue?"', () => {
			const text = 'The changes look good. Should I apply them to the rest of the files?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'Yes', value: 'yes' },
				{ label: 'No', value: 'no' },
			]);
		});

		it('should detect "Do you want me to..."', () => {
			const text = 'Do you want me to fix the remaining lint errors?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'Yes', value: 'yes' },
				{ label: 'No', value: 'no' },
			]);
		});

		it('should detect "Shall I..."', () => {
			const text = 'Shall I create the migration file?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'Yes', value: 'yes' },
				{ label: 'No', value: 'no' },
			]);
		});

		it('should detect standalone "proceed?" signal', () => {
			const text = 'Everything is ready. Proceed?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([
				{ label: 'Yes', value: 'yes' },
				{ label: 'No', value: 'no' },
			]);
		});

		it('should not match a question without a yes/no signal', () => {
			const text = 'What color should the button be?';

			const result = parseSmartReplies(text);
			expect(result).toEqual([]);
		});
	});

	// ========================================================================
	// Code fence exclusion
	// ========================================================================

	describe('code fence exclusion', () => {
		it('should not detect numbered options inside code fences', () => {
			const text = [
				'Here is the code:',
				'```',
				'Which option?',
				'1. First',
				'2. Second',
				'```',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toEqual([]);
		});

		it('should detect options outside code fences even when fences are present', () => {
			const text = [
				'Here is some code:',
				'```typescript',
				'const x = 1;',
				'const y = 2;',
				'```',
				'',
				'Which approach do you prefer?',
				'1. Use approach A',
				'2. Use approach B',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('1');
		});
	});

	// ========================================================================
	// No question present
	// ========================================================================

	describe('no question context', () => {
		it('should not detect a plain numbered list without a question', () => {
			const text = [
				'Here are the steps I took:',
				'1. Updated the config',
				'2. Ran the tests',
				'3. Verified the output',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toEqual([]);
		});
	});

	// ========================================================================
	// Mixed content
	// ========================================================================

	describe('mixed content', () => {
		it('should find options buried in longer text', () => {
			const text = [
				'I analyzed the codebase and found several issues.',
				'The main problem is in the parser module.',
				'',
				'I have two proposals for fixing this:',
				'',
				'What would you like to do?',
				'1. Quick fix — patch the regex',
				'2. Full refactor — rewrite the parser',
			].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toHaveLength(2);
			expect(result[0].label).toBe('1. Quick fix — patch the regex');
		});
	});

	// ========================================================================
	// Priority: numbered options over yes/no
	// ========================================================================

	describe('priority', () => {
		it('should return numbered options when both numbered and yes/no are present', () => {
			const text = [
				'Would you like me to proceed?',
				'',
				'Which approach?',
				'1. Option A',
				'2. Option B',
			].join('\n');

			const result = parseSmartReplies(text);
			// Numbered takes priority — should NOT be Yes/No
			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('1');
			expect(result[1].value).toBe('2');
		});
	});

	// ========================================================================
	// Edge cases
	// ========================================================================

	describe('edge cases', () => {
		it('should return empty for empty string', () => {
			expect(parseSmartReplies('')).toEqual([]);
		});

		it('should return empty for whitespace-only input', () => {
			expect(parseSmartReplies('   \n\n  ')).toEqual([]);
		});

		it('should return empty for null/undefined input', () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(parseSmartReplies(null as any)).toEqual([]);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(parseSmartReplies(undefined as any)).toEqual([]);
		});

		it('should handle options with blank lines between them', () => {
			const text = ['Which one?', '1. First', '', '2. Second'].join('\n');

			const result = parseSmartReplies(text);
			expect(result).toHaveLength(2);
		});
	});
});
