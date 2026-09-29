import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.enableCors();
	app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

	const config = new DocumentBuilder()
		.setTitle("backdash")
		.setDescription("Kanban + event stream backend for the dash frontend")
		.setVersion("0.0.1")
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup("docs", app, document);

	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
