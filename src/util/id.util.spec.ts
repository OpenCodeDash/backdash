import { describe, expect, it } from "vitest";
import { generateBoardId } from "./id.util.js";

describe("generateBoardId", () => {
	it("returns a 6-character lowercase a-z id", () => {
		const id = generateBoardId();
		expect(id).toHaveLength(6);
		expect(id).toMatch(/^[a-z]{6}$/);
	});

	it("does not return the same id twice in a row of draws", () => {
		const ids = new Set(Array.from({ length: 200 }, () => generateBoardId()));
		expect(ids.size).toBeGreaterThan(1);
	});
});
