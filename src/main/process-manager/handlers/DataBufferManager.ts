import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DATA_BUFFER_FLUSH_INTERVAL, DATA_BUFFER_SIZE_THRESHOLD } from '../constants';
import type { ManagedProcess } from '../types';

/**
 * Manages data buffering for process output to reduce IPC event frequency.
 */
export class DataBufferManager {
	constructor(
		private processes: Map<string, ManagedProcess>,
		private emitter: EventEmitter
	) {}

	/**
	 * Buffer data and emit in batches.
	 * Data is accumulated and flushed every 50ms or when buffer exceeds 8KB.
	 */
	emitDataBuffered(sessionId: string, data: string): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) {
			this.emitter.emit('data', sessionId, data);
			return;
		}

		managedProcess.dataBuffer = (managedProcess.dataBuffer || '') + data;

		if (managedProcess.dataBuffer.length > DATA_BUFFER_SIZE_THRESHOLD) {
			this.flushDataBuffer(sessionId);
			return;
		}

		if (!managedProcess.dataBufferTimeout) {
			managedProcess.dataBufferTimeout = setTimeout(() => {
				this.flushDataBuffer(sessionId);
			}, DATA_BUFFER_FLUSH_INTERVAL);
		}
	}

	/**
	 * Buffer raw (unfiltered) data and emit in batches.
	 * Same 50ms/8KB strategy as emitDataBuffered, but emits 'rawData' events
	 * that bypass stripControlSequences for xterm.js consumption.
	 */
	emitRawDataBuffered(sessionId: string, data: string): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) {
			this.emitter.emit('rawData', sessionId, data);
			return;
		}

		managedProcess.rawDataBuffer = (managedProcess.rawDataBuffer || '') + data;

		if (managedProcess.rawDataBuffer.length > DATA_BUFFER_SIZE_THRESHOLD) {
			this.flushRawDataBuffer(sessionId);
			return;
		}

		if (!managedProcess.rawDataBufferTimeout) {
			managedProcess.rawDataBufferTimeout = setTimeout(() => {
				this.flushRawDataBuffer(sessionId);
			}, DATA_BUFFER_FLUSH_INTERVAL);
		}
	}

	/**
	 * Flush the raw data buffer for a session
	 */
	flushRawDataBuffer(sessionId: string): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) return;

		if (managedProcess.rawDataBufferTimeout) {
			clearTimeout(managedProcess.rawDataBufferTimeout);
			managedProcess.rawDataBufferTimeout = undefined;
		}

		if (managedProcess.rawDataBuffer) {
			try {
				this.emitter.emit('rawData', sessionId, managedProcess.rawDataBuffer);
			} catch (err) {
				logger.error('[ProcessManager] Error flushing raw data buffer', 'ProcessManager', {
					sessionId,
					error: String(err),
				});
			}
			managedProcess.rawDataBuffer = undefined;
		}
	}

	/**
	 * Flush the data buffer for a session
	 */
	flushDataBuffer(sessionId: string): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) return;

		if (managedProcess.dataBufferTimeout) {
			clearTimeout(managedProcess.dataBufferTimeout);
			managedProcess.dataBufferTimeout = undefined;
		}

		if (managedProcess.dataBuffer) {
			try {
				this.emitter.emit('data', sessionId, managedProcess.dataBuffer);
			} catch (err) {
				logger.error('[ProcessManager] Error flushing data buffer', 'ProcessManager', {
					sessionId,
					error: String(err),
				});
			}
			managedProcess.dataBuffer = undefined;
		}
	}
}
