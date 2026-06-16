/**
 * JSON Schema validation for tool arguments, backed by Ajv. Invalid arguments are
 * rejected before a tool runs and reported as a typed error the agent can act on.
 * (FR-011)
 *
 * @packageDocumentation
 */

import Ajv, { type ValidateFunction } from "ajv";
import type { JSONSchema } from "../core/types.js";
import { ValidationError } from "../core/errors.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const cache = new WeakMap<JSONSchema, ValidateFunction>();

function compile(schema: JSONSchema): ValidateFunction {
	let fn = cache.get(schema);
	if (!fn) {
		fn = ajv.compile(schema);
		cache.set(schema, fn);
	}
	return fn;
}

/**
 * Validate `args` against `schema`. Returns the args on success; throws a
 * {@link ValidationError} listing the failures otherwise.
 */
export function validateArgs<T = unknown>(schema: JSONSchema, args: unknown): T {
	const validate = compile(schema);
	if (!validate(args)) {
		const messages = (validate.errors ?? [])
			.map((e) => `${e.instancePath || "(root)"} ${e.message}`)
			.join("; ");
		throw new ValidationError(`Invalid arguments: ${messages}`, { errors: validate.errors });
	}
	return args as T;
}
