/**
 * Row Mapper Functions
 *
 * Converts snake_case SQLite row objects to camelCase TypeScript interfaces.
 * Centralizes the mapping logic that was previously duplicated across CRUD methods.
 */

import type { QueryEvent, SessionLifecycleEvent } from '../../shared/stats-types';
import type { MigrationRecord } from './types';

// ============================================================================
// Raw Row Types (snake_case from SQLite)
// ============================================================================

export interface QueryEventRow {
	id: string;
	session_id: string;
	agent_type: string;
	source: 'user' | 'auto';
	start_time: number;
	duration: number;
	project_path: string | null;
	tab_id: string | null;
	is_remote: number | null;
}

export interface SessionLifecycleRow {
	id: string;
	session_id: string;
	agent_type: string;
	project_path: string | null;
	created_at: number;
	closed_at: number | null;
	duration: number | null;
	is_remote: number | null;
}

export interface MigrationRecordRow {
	version: number;
	description: string;
	applied_at: number;
	status: 'success' | 'failed';
	error_message: string | null;
}

// ============================================================================
// Mapper Functions
// ============================================================================

export function mapQueryEventRow(row: QueryEventRow): QueryEvent {
	return {
		id: row.id,
		sessionId: row.session_id,
		agentType: row.agent_type,
		source: row.source,
		startTime: row.start_time,
		duration: row.duration,
		projectPath: row.project_path ?? undefined,
		tabId: row.tab_id ?? undefined,
		isRemote: row.is_remote !== null ? row.is_remote === 1 : undefined,
	};
}

export function mapSessionLifecycleRow(row: SessionLifecycleRow): SessionLifecycleEvent {
	return {
		id: row.id,
		sessionId: row.session_id,
		agentType: row.agent_type,
		projectPath: row.project_path ?? undefined,
		createdAt: row.created_at,
		closedAt: row.closed_at ?? undefined,
		duration: row.duration ?? undefined,
		isRemote: row.is_remote !== null ? row.is_remote === 1 : undefined,
	};
}

export function mapMigrationRecordRow(row: MigrationRecordRow): MigrationRecord {
	return {
		version: row.version,
		description: row.description,
		appliedAt: row.applied_at,
		status: row.status,
		errorMessage: row.error_message ?? undefined,
	};
}
