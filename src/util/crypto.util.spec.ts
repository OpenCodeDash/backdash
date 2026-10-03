import { describe, expect, it } from "vitest";
import {
	TOKEN_PREFIX_LENGTH,
	generateToken,
	hashSecret,
	tokenPrefix,
	verifySecret,
} from "./crypto.util.js";

describe("crypto.util", () => {
	it("generateToken returns a prefixed, high-entropy token", () => {
		expect(generateToken()).toMatch(/^bdsk_[0-9a-f]{48}$/);
	});

	it("generateToken does not repeat", () => {
		expect(generateToken()).not.toBe(generateToken());
	});

	it("tokenPrefix returns the leading characters of the token", () => {
		const token = "bdsk_0123456789abcdef";
		expect(tokenPrefix(token)).toBe(token.slice(0, TOKEN_PREFIX_LENGTH));
	});

	it("hashSecret/verifySecret round-trips and salts every hash", () => {
		const a = hashSecret("hunter2");
		const b = hashSecret("hunter2");

		expect(a).not.toBe(b);
		expect(verifySecret("hunter2", a)).toBe(true);
		expect(verifySecret("hunter2", b)).toBe(true);
	});

	it("verifySecret rejects a wrong secret", () => {
		expect(verifySecret("wrong", hashSecret("right"))).toBe(false);
	});

	it("verifySecret fails closed on missing or malformed hashes", () => {
		expect(verifySecret("x", null)).toBe(false);
		expect(verifySecret("x", "not-a-hash")).toBe(false);
		expect(verifySecret("x", "salt:")).toBe(false);
	});
});
