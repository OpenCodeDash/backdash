import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt output length. 64 bytes matches Node's recommended default cost and
// keeps hashing fast enough for interactive login while remaining expensive to
// brute-force.
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Visible prefix on every issued token, so a leaked secret is recognisable as a
// backdash token (mirrors `ghp_`/`sk_` style keys). The prefix is also used as
// the lookup key before the slow scrypt verification runs.
export const TOKEN_PREFIX_LENGTH = 12;

export function generateToken(): string {
	return `bdsk_${randomBytes(24).toString("hex")}`;
}

export function tokenPrefix(token: string): string {
	return token.slice(0, TOKEN_PREFIX_LENGTH);
}

// Hashes a secret (password or token) with a fresh random salt. The result is
// stored as `<salt>:<hash>` so the salt travels with the entry.
export function hashSecret(secret: string): string {
	const salt = randomBytes(SALT_LENGTH).toString("hex");
	const hash = scryptSync(secret, salt, KEY_LENGTH).toString("hex");

	return `${salt}:${hash}`;
}

// Constant-time comparison of a secret against a stored `<salt>:<hash>`. Any
// malformed/missing value fails closed.
export function verifySecret(secret: string, stored: string | null): boolean {
	if (!stored) {
		return false;
	}

	const [salt, hash] = stored.split(":");

	if (!salt || !hash) {
		return false;
	}

	const expected = Buffer.from(hash, "hex");
	const actual = scryptSync(secret, salt, KEY_LENGTH);

	if (expected.length !== actual.length) {
		return false;
	}

	return timingSafeEqual(expected, actual);
}
