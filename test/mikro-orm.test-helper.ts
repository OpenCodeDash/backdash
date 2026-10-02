import { Test, type TestingModule } from "@nestjs/testing";
import { type Provider, type Type } from "@nestjs/common";
import { EntityManager, MikroORM } from "@mikro-orm/core";
import { defineConfig } from "@mikro-orm/sqlite";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { BoardEntity } from "#/kanban/entity/board.entity";
import { ColumnEntity } from "#/kanban/entity/column.entity";
import { TaskEntity } from "#/kanban/entity/task.entity";
import { TagEntity } from "#/kanban/entity/tag.entity";
import { EventEntity } from "#/events/entity/event.entity";

// Every entity in the app, passed as class references so MikroORM never has to
// glob/import .ts files (which Node's loader can't parse under vitest).
export const TEST_ENTITIES = [
	BoardEntity,
	ColumnEntity,
	TaskEntity,
	TagEntity,
	EventEntity,
];

// Shared in-memory ORM config: explicit entity class refs (no .ts glob), a
// single shared better-sqlite3 connection, and global-context allowed so repos
// bound to the root EM can run context-specific actions without a request.
export function testConfig() {
	return defineConfig({
		entities: TEST_ENTITIES,
		dbName: ":memory:",
		metadataProvider: ReflectMetadataProvider,
		allowGlobalContext: true,
	});
}

export interface TestOrm {
	orm: MikroORM;
	em: EntityManager;
}

// Raw ORM + schema, no Nest. For repository-level tests.
export async function initTestOrm(): Promise<TestOrm> {
	const orm = (await MikroORM.init(testConfig())) as unknown as MikroORM;
	await orm.schema.create();

	return { orm, em: orm.em };
}

export interface TestContext {
	module: TestingModule;
	orm: MikroORM;
	em: EntityManager;
}

// Full Nest module with a :memory: ORM and schema already created. For
// service/controller tests that need the real DI wiring.
export async function createTestContext(
	modules: Type[] = [],
	providers: Provider[] = []
): Promise<TestContext> {
	const module = await Test.createTestingModule({
		imports: [MikroOrmModule.forRoot(testConfig()), ...modules],
		providers,
	}).compile();

	const orm = module.get(MikroORM) as unknown as MikroORM;
	await orm.schema.create();
	await module.init();

	return { module, orm, em: module.get(EntityManager) };
}
