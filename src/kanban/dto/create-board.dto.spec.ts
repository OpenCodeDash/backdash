import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateBoardDto } from "./create-board.dto.js";

async function validateDto(input: object) {
	const dto = plainToInstance(CreateBoardDto, input);
	return validate(dto);
}

describe("CreateBoardDto", () => {
	it("accepts a valid name", async () => {
		expect(await validateDto({ name: "My board" })).toHaveLength(0);
	});

	it("rejects an empty name", async () => {
		expect((await validateDto({ name: "" })).length).toBeGreaterThan(0);
	});

	it("rejects a missing name", async () => {
		const errors = await validateDto({});
		expect(errors.some((e) => e.property === "name")).toBe(true);
	});

	it("rejects a non-string name", async () => {
		const errors = await validateDto({ name: 123 });
		expect(errors.some((e) => e.property === "name")).toBe(true);
	});

	it("rejects a name longer than 200 characters", async () => {
		const errors = await validateDto({ name: "a".repeat(201) });
		expect(errors.some((e) => e.property === "name")).toBe(true);
	});
});
