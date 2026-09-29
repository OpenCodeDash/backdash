import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ReorderColumnsDto } from "./reorder-columns.dto.js";

async function validateDto(input: object) {
	const dto = plainToInstance(ReorderColumnsDto, input);
	return validate(dto);
}

describe("ReorderColumnsDto", () => {
	it("accepts a non-empty array of unique integers", async () => {
		expect(await validateDto({ columnIds: [3, 1, 2] })).toHaveLength(0);
	});

	it("rejects an empty array", async () => {
		expect((await validateDto({ columnIds: [] })).length).toBeGreaterThan(0);
	});

	it("rejects a missing array", async () => {
		expect((await validateDto({})).length).toBeGreaterThan(0);
	});

	it("rejects duplicate ids", async () => {
		const errors = await validateDto({ columnIds: [1, 1] });
		expect(errors.some((e) => e.property === "columnIds")).toBe(true);
	});

	it("rejects non-integer values", async () => {
		const errors = await validateDto({ columnIds: [1, 2.5] });
		expect(errors.some((e) => e.property === "columnIds")).toBe(true);
	});
});
