/**
 * Centralized prompts module
 *
 * All prompts are stored as .md files in this directory and compiled
 * to TypeScript at build time by scripts/generate-prompts.mjs.
 *
 * The generated file is at src/generated/prompts.ts
 */

export {
	// Input processing
	imageOnlyDefaultPrompt,

	// Commands
	commitCommandPrompt,

	// Maestro system prompt
	maestroSystemPrompt,

	// Output style prompts
	outputStyleExplanatoryPrompt,
	outputStyleLearningPrompt,

	// Context management
	contextGroomingPrompt,
	contextTransferPrompt,
	contextSummarizePrompt,

	// Tab naming
	tabNamingPrompt,
} from '../generated/prompts';
