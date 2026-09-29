import { Migration } from '@mikro-orm/migrations';

export class Migration20260929035357 extends Migration {

  override name = 'Migration20260929035357';

  override up(): void | Promise<void> {
    this.addSql(`create table \`boards\` (\`id\` text not null primary key, \`name\` text not null);`);

    this.addSql(`create table \`columns\` (\`id\` integer not null primary key autoincrement, \`board_id\` text not null, \`name\` text not null, \`position\` integer not null, \`is_queue\` integer not null default false, \`push_description\` text not null default '', \`pull_description\` text not null default '', constraint \`columns_board_id_foreign\` foreign key (\`board_id\`) references \`boards\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`columns_board_id_index\` on \`columns\` (\`board_id\`);`);
    this.addSql(`create index \`columns_board_id_position_index\` on \`columns\` (\`board_id\`, \`position\`);`);
    this.addSql(`create unique index \`columns_board_id_name_unique\` on \`columns\` (\`board_id\`, \`name\`);`);

    this.addSql(`create table \`events\` (\`seq\` integer not null primary key autoincrement, \`board_id\` text not null, \`type\` text not null, \`actor\` text not null, \`payload\` json not null, \`created_at\` datetime not null, constraint \`events_board_id_foreign\` foreign key (\`board_id\`) references \`boards\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`events_board_id_index\` on \`events\` (\`board_id\`);`);
    this.addSql(`create index \`events_board_id_seq_index\` on \`events\` (\`board_id\`, \`seq\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`boards\`;`);
    this.addSql(`drop table if exists \`columns\`;`);
    this.addSql(`drop table if exists \`events\`;`);
  }

}
