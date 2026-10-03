import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "./load-env.js";

const TEST_VAR = "BACKDASH_LOAD_ENV_TEST";
let dir: string | undefined;

afterEach(() => {
	delete process.env[TEST_VAR];
	if (dir) {
		rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	}
});

describe("loadEnvFile", () => {
	it("loads variables from the given file", () => {
		dir = mkdtempSync(join(tmpdir(), "backdash-env-"));
		const file = join(dir, ".env");
		writeFileSync(file, `${TEST_VAR}=hello\n`);

		expect(loadEnvFile(file)).toBe(true);
		expect(process.env[TEST_VAR]).toBe("hello");
	});

	it("is a no-op when the file is missing", () => {
		expect(loadEnvFile(join(tmpdir(), "backdash-missing", ".env"))).toBe(
			false
		);
		expect(process.env[TEST_VAR]).toBeUndefined();
	});
});
