import "./load-env.js";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { parseCorsOrigins } from "./util/cors.util.js";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// Apply pending migrations so a brand-new DATABASE_PATH is usable the moment
	// the process starts. `up()` only runs migrations not yet recorded in the
	// `mikro_orm_migrations` table, so this is a no-op on an already-migrated DB.
	const orm = app.get(MikroORM);
	await orm.migrator.up();

	// CORS: any origin by default for local development. Set
	// BACKDASH_CORS_ORIGINS to a comma-separated allowlist to lock it down.
	// Auth is a bearer header (not a cookie), so credentials stay off.
	app.enableCors({
		origin: parseCorsOrigins(process.env.BACKDASH_CORS_ORIGINS),
		credentials: false,
	});
	app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

	const config = new DocumentBuilder()
		.setTitle("backdash")
		.setDescription("Kanban + event stream backend for the dash frontend")
		.setVersion("0.0.1")
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup("docs", app, document);
	app.getHttpAdapter().getInstance().get("/openapi.json", (_req: unknown, res: { json: (v: unknown) => void }) => {
		res.json(document);
	});

	// Loopback by default so the API is not reachable from the LAN. Set
	// BACKDASH_HOST=0.0.0.0 to expose it deliberately (e.g. a container/proxy).
	await app.listen(
		process.env.PORT ?? 3000,
		process.env.BACKDASH_HOST ?? "127.0.0.1"
	);
}
await bootstrap();
