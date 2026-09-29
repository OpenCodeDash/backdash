import { describe, expect, it } from "vitest";
import { parseLastEventId } from "./events.util.js";

describe("parseLastEventId", () => {
	it("returns undefined when both sources are absent", () => {
		expect(parseLastEventId()).toBeUndefined();
	});

	it("prefers the header over the query", () => {
		expect(parseLastEventId("5", "9")).toBe(5);
	});

	it("falls back to the query when the header is absent", () => {
		expect(parseLastEventId(undefined, "7")).toBe(7);
	});

	it("returns undefined for blank input", () => {
		expect(parseLastEventId("   ")).toBeUndefined();
		expect(parseLastEventId(undefined, "")).toBeUndefined();
	});

	it("returns undefined for non-integer or negative values", () => {
		expect(parseLastEventId("1.5")).toBeUndefined();
		expect(parseLastEventId("-3")).toBeUndefined();
		expect(parseLastEventId("abc")).toBeUndefined();
	});

	it("parses a valid integer, including zero", () => {
		expect(parseLastEventId("0")).toBe(0);
		expect(parseLastEventId("  42 ")).toBe(42);
	});
});
