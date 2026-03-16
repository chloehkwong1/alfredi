/**
 * fontSizeClass - Maps fontSize setting (14/16/18) to Tailwind text classes.
 *
 * Primary class is the main content size; secondary is one step smaller
 * for metadata, timestamps, tool output, etc.
 */

/** Map fontSize preset to primary Tailwind text class */
export function fontSizeToClass(fontSize: number): string {
	switch (fontSize) {
		case 18:
			return 'text-lg';
		case 16:
			return 'text-base';
		case 14:
		default:
			return 'text-sm';
	}
}

/** Map fontSize preset to secondary (one step smaller) Tailwind text class */
export function fontSizeToSecondary(fontSize: number): string {
	switch (fontSize) {
		case 18:
			return 'text-base';
		case 16:
			return 'text-sm';
		case 14:
		default:
			return 'text-xs';
	}
}

/** Map fontSize preset to tertiary (micro labels, badges) Tailwind text class */
export function fontSizeToTertiary(fontSize: number): string {
	switch (fontSize) {
		case 18:
			return 'text-xs';
		case 16:
			return 'text-[11px]';
		case 14:
		default:
			return 'text-[10px]';
	}
}
