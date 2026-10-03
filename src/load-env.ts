import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Loads a dotenv file into process.env using Node's built-in loader (Node
// >= 20.12), so no dotenv dependency is required. Returns false when the file
// does not exist. Existing environment variables are not overridden.
export function loadEnvFile(path = resolve(process.cwd(), ".env")): boolean {
	if (!existsSync(path)) {
		return false;
	}

	process.loadEnvFile(path);

	return true;
}

// Side effect on import: load the project's `.env` before any other module
// reads process.env. Imported first from main.ts and mikro-orm.config.ts so
// both the app and the MikroORM CLI resolve configuration the same way.
loadEnvFile();
