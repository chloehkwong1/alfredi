/**
 * InlineWizardContext - Stub after stripping Auto Run / Batch features
 *
 * The inline wizard depended on the batch/auto run infrastructure.
 * This stub provides the context interface so consuming components compile,
 * but the wizard functionality is no-op.
 */

import { createContext, useContext, ReactNode } from 'react';
import type { ThinkingMode } from '../types';

// Inline types (previously from batch/useInlineWizard)
export type InlineWizardMode = 'new' | 'iterate' | null;
export interface InlineWizardMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}
export interface InlineGeneratedDocument {
	filename: string;
	content: string;
	taskCount: number;
	savedPath?: string;
}
export interface PreviousUIState {
	readOnlyMode: boolean;
	saveToHistory: boolean;
	showThinking: ThinkingMode;
}
export interface InlineWizardState {
	isActive: boolean;
	mode: InlineWizardMode;
	goal?: string;
	confidence: number;
	ready?: boolean;
}

export interface UseInlineWizardReturn {
	isWizardActive: boolean;
	isInitializing: boolean;
	isWaiting: boolean;
	wizardMode: InlineWizardMode;
	wizardGoal: string;
	confidence: number;
	ready: boolean;
	readyToGenerate: boolean;
	conversationHistory: InlineWizardMessage[];
	isGeneratingDocs: boolean;
	generatedDocuments: InlineGeneratedDocument[];
	existingDocuments: any[];
	error: string | null;
	state: InlineWizardState;
	streamingContent: string;
	generationProgress: string;
	wizardTabId: string | null;
	startWizard: (...args: any[]) => void;
	endWizard: (...args: any[]) => PreviousUIState | null;
	sendMessage: (...args: any[]) => void;
	setConfidence: (n: number) => void;
	setMode: (m: InlineWizardMode) => void;
	setGoal: (g: string) => void;
	setGeneratingDocs: (b: boolean) => void;
	setGeneratedDocuments: (docs: InlineGeneratedDocument[]) => void;
	setExistingDocuments: (docs: any[]) => void;
	setError: (e: string | null) => void;
	clearError: () => void;
	retryLastMessage: () => void;
	addAssistantMessage: (content: string) => void;
	clearConversation: () => void;
	reset: () => void;
	generateDocuments: (...args: any[]) => Promise<void>;
	getStateForTab: (tabId: string) => any;
	cancelGeneration: (...args: any[]) => void;
	selectDocument: (...args: any[]) => void;
	updateDocument: (...args: any[]) => void;
	saveDocuments: (...args: any[]) => void;
	handleTabClose: (...args: any[]) => void;
	getPreviousUIState: () => PreviousUIState | null;
}

export type InlineWizardContextValue = UseInlineWizardReturn;

const InlineWizardContext = createContext<InlineWizardContextValue | null>(null);

const noopReturn: UseInlineWizardReturn = {
	isWizardActive: false,
	isInitializing: false,
	isWaiting: false,
	wizardMode: null,
	wizardGoal: '',
	confidence: 0,
	ready: false,
	readyToGenerate: false,
	conversationHistory: [],
	isGeneratingDocs: false,
	generatedDocuments: [],
	existingDocuments: [],
	error: null,
	state: { isActive: false, mode: null, confidence: 0 },
	streamingContent: '',
	generationProgress: '',
	wizardTabId: null,
	startWizard: () => {},
	endWizard: () => null,
	sendMessage: () => {},
	setConfidence: () => {},
	setMode: () => {},
	setGoal: () => {},
	setGeneratingDocs: () => {},
	setGeneratedDocuments: () => {},
	setExistingDocuments: () => {},
	setError: () => {},
	clearError: () => {},
	retryLastMessage: () => {},
	addAssistantMessage: () => {},
	clearConversation: () => {},
	reset: () => {},
	generateDocuments: async () => {},
	getStateForTab: () => null,
	cancelGeneration: () => {},
	selectDocument: () => {},
	updateDocument: () => {},
	saveDocuments: () => {},
	handleTabClose: () => {},
	getPreviousUIState: () => null,
};

interface InlineWizardProviderProps {
	children: ReactNode;
}

export function InlineWizardProvider({ children }: InlineWizardProviderProps) {
	return <InlineWizardContext.Provider value={noopReturn}>{children}</InlineWizardContext.Provider>;
}

export function useInlineWizardContext(): InlineWizardContextValue {
	const context = useContext(InlineWizardContext);
	if (!context) {
		throw new Error('useInlineWizardContext must be used within an InlineWizardProvider');
	}
	return context;
}
