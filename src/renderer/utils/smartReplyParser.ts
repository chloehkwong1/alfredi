/**
 * Smart Reply Parser
 *
 * Pure utility for detecting actionable options in AI agent output.
 * When an agent finishes responding with numbered options or a yes/no question,
 * this parser extracts structured replies for clickable chip display.
 *
 * Design priorities:
 * - False negatives are acceptable; false positives are not
 * - Numbered options take priority over yes/no detection
 * - Code fences are stripped before analysis
 * - Only the last ~30 lines are scanned to avoid matching stale context
 */

// ============================================================================
// Types
// ============================================================================

export interface SmartReply {
	/** Display text shown on the chip */
	label: string;
	/** Value sent to the agent when clicked */
	value: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Max lines from the end of message to scan */
const SCAN_TAIL_LINES = 30;

/** Patterns that signal a yes/no question (case-insensitive) */
const YES_NO_SIGNALS = [
	/would you like/i,
	/do you want/i,
	/should i/i,
	/shall i/i,
	/\bcontinue\?/i,
	/\bproceed\?/i,
	/\bready\?/i,
	/\bgo ahead\?/i,
	/\bok\?/i,
	/\bcorrect\?/i,
	/\bright\?/i,
	/\bagree\?/i,
	/want me to/i,
	/like me to/i,
];

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Remove content inside triple-backtick code fences.
 * Replaces fenced blocks with empty strings so numbered lists
 * inside code examples are not falsely detected.
 */
function stripCodeFences(text: string): string {
	return text.replace(/```[\s\S]*?```/g, '');
}

/**
 * Extract the last N lines from text (after code fence stripping).
 */
function getTailLines(text: string, n: number): string[] {
	const lines = text.split('\n');
	return lines.slice(-n);
}

/**
 * Detect numbered or lettered option lists preceded by a question.
 *
 * Looks for patterns like:
 *   Which approach do you prefer?
 *   1. Option A
 *   2. Option B
 *   3. Option C
 *
 * Also supports lettered variants: a) Option A, b) Option B
 */
function detectNumberedOptions(lines: string[]): SmartReply[] {
	// Regex for numbered items: "1." "2." etc., or "1)" "2)" etc.
	const numberedRe = /^\s*(\d+)[.)]\s+(.+)$/;
	// Regex for lettered items: "a)" "b)" "a." "b." etc.
	const letteredRe = /^\s*([a-z])[.)]\s+(.+)$/i;

	// Walk backwards to find the last contiguous block of numbered/lettered items
	let blockEnd = -1;
	let blockStart = -1;
	let isNumbered = false;

	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (!line) continue; // skip blank lines

		const numMatch = numberedRe.exec(line);
		const letMatch = letteredRe.exec(line);

		if (numMatch || letMatch) {
			if (blockEnd === -1) {
				blockEnd = i;
				isNumbered = !!numMatch;
			}
			blockStart = i;
		} else if (blockEnd !== -1) {
			// We've hit a non-option line — the block ends here
			break;
		}
	}

	if (blockEnd === -1 || blockStart === blockEnd) {
		// No block found, or only a single item (not a choice list)
		return [];
	}

	// Verify there's a question line before the block (within a few lines)
	let hasQuestion = false;
	for (let i = blockStart - 1; i >= Math.max(0, blockStart - 5); i--) {
		if (lines[i].trim().endsWith('?')) {
			hasQuestion = true;
			break;
		}
	}

	if (!hasQuestion) {
		return [];
	}

	// Extract the options
	const re = isNumbered ? numberedRe : letteredRe;
	const replies: SmartReply[] = [];

	for (let i = blockStart; i <= blockEnd; i++) {
		const match = re.exec(lines[i].trim());
		if (match) {
			const prefix = match[1];
			const text = match[2].trim();
			replies.push({
				label: `${prefix}. ${text}`,
				value: prefix,
			});
		}
	}

	return replies.length >= 2 ? replies : [];
}

/**
 * Detect yes/no questions in the tail of the message.
 * Scans for lines ending with `?` that contain known signal phrases.
 */
function detectYesNo(lines: string[]): SmartReply[] {
	// Scan from the end, looking for a question with yes/no signals
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (!line) continue;

		if (line.endsWith('?')) {
			const matchesSignal = YES_NO_SIGNALS.some((re) => re.test(line));
			if (matchesSignal) {
				return [
					{ label: 'Yes', value: 'yes' },
					{ label: 'No', value: 'no' },
				];
			}
		}

		// Stop scanning after hitting 10 non-empty lines without a match
		// to avoid matching questions deep in the output
		if (line.length > 0) {
			const remaining = lines.slice(i).filter((l) => l.trim().length > 0).length;
			if (remaining > 10) break;
		}
	}

	return [];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse the last AI message for actionable smart reply options.
 *
 * Returns structured replies suitable for rendering as clickable chips.
 * Returns an empty array if no actionable pattern is detected.
 *
 * @param text - The full text of the last AI message
 * @returns Array of SmartReply objects (empty if nothing detected)
 *
 * @example
 * const replies = parseSmartReplies(aiOutput);
 * // Numbered: [{ label: "1. Refactor", value: "1" }, { label: "2. Rewrite", value: "2" }]
 * // Yes/No:   [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]
 * // Nothing:  []
 */
export function parseSmartReplies(text: string): SmartReply[] {
	if (!text || typeof text !== 'string') {
		return [];
	}

	const stripped = stripCodeFences(text);
	const tailLines = getTailLines(stripped, SCAN_TAIL_LINES);

	// Numbered options take priority
	const numbered = detectNumberedOptions(tailLines);
	if (numbered.length > 0) {
		return numbered;
	}

	// Fall back to yes/no detection
	return detectYesNo(tailLines);
}
