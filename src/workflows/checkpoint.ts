/**
 * Workflow checkpointing. A checkpoint is a serializable snapshot enabling resume.
 * Restore fails closed: corrupt or version-mismatched data yields a typed
 * {@link CheckpointError} with no partial restore. (FR-022, FR-022a)
 *
 * @packageDocumentation
 */

import { CheckpointError } from "../core/errors.js";

/** Current checkpoint schema version. */
export const CHECKPOINT_VERSION = "1";

/** A serializable workflow snapshot. */
export interface Checkpoint {
	version: string;
	id: string;
	/** Opaque workflow state (round, messages, pending node, etc.). */
	state: Record<string, unknown>;
}

/** Create a checkpoint with the current schema version. */
export function createCheckpoint(id: string, state: Record<string, unknown>): Checkpoint {
	return { version: CHECKPOINT_VERSION, id, state };
}

/** Serialize a checkpoint to a string. */
export function serializeCheckpoint(cp: Checkpoint): string {
	return JSON.stringify(cp);
}

/**
 * Restore a checkpoint from its serialized form or object. Fails closed.
 *
 * @throws {CheckpointError} `corrupt` if the data cannot be parsed/validated.
 * @throws {CheckpointError} `version-mismatch` if the schema version differs.
 */
export function restoreCheckpoint(input: string | Checkpoint): Checkpoint {
	let cp: Checkpoint;
	if (typeof input === "string") {
		try {
			cp = JSON.parse(input) as Checkpoint;
		} catch {
			throw new CheckpointError("Checkpoint data is not valid JSON", "corrupt");
		}
	} else {
		cp = input;
	}

	if (!cp || typeof cp !== "object" || typeof cp.id !== "string" || typeof cp.state !== "object") {
		throw new CheckpointError("Checkpoint is missing required fields", "corrupt");
	}
	if (cp.version !== CHECKPOINT_VERSION) {
		throw new CheckpointError(
			`Checkpoint version ${cp.version} does not match ${CHECKPOINT_VERSION}`,
			"version-mismatch",
		);
	}
	return cp;
}
