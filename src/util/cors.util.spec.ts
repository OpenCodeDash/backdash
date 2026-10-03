import { describe, expect, it } from "vitest";
import { parseCorsOrigins } from "./cors.util.js";

describe("parseCorsOrigins", () => {
	it("returns '*' when unset or empty", () => {
		expect(parseCorsOrigins(undefined)).toBe("*");
		expect(parseCorsOrigins("")).toBe("*");
		expect(parseCorsOrigins("  ,  ")).toBe("*");
	});

	it("splits, trims, and drops blank entries", () => {
		expect(parseCorsOrigins("http://a.test, http://b.test ,")).toEqual([
			"http://a.test",
			"http://b.test",
		]);
	});

	it("returns a single origin as a one-element list", () => {
		expect(parseCorsOrigins("https://dash.example.com")).toEqual([
			"https://dash.example.com",
		]);
	});
});
