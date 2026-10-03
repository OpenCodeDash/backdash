import { Migration } from '@mikro-orm/migrations';

export class Migration20261003181346_AddTaskTodos extends Migration {

  override name = 'Migration20261003181346_AddTaskTodos';

  override up(): void | Promise<void> {
    // NOT NULL with a JSON default: SQLite requires a non-null default when
    // adding a NOT NULL column to a populated table, so existing tasks get [].
    this.addSql(`alter table \`tasks\` add column \`todos\` json not null default '[]';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`tasks\` drop column \`todos\`;`);
  }

}
