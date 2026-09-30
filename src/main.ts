import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// Apply pending migrations so a brand-new DATABASE_PATH is usable the moment
	// the process starts. `up()` only runs migrations not yet recorded in the
	// `mikro_orm_migrations` table, so this is a no-op on an already-migrated DB.
	const orm = app.get(MikroORM);
	await orm.migrator.up();

	app.enableCors();
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

	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
