import { defineConfig } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";

export default defineConfig({
	dbName: process.env.DATABASE_PATH ?? "./app.sqlite",

	entities: ["./dist/**/*.entity.js"],
	entitiesTs: ["./src/**/*.entity.ts"],

	metadataProvider: ReflectMetadataProvider,

	extensions: [Migrator],

	migrations: {
		path: "./dist/migrations",
		pathTs: "./src/migrations",
	},
});
