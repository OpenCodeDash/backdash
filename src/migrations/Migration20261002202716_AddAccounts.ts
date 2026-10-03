import { Migration } from '@mikro-orm/migrations';

export class Migration20261002202716_AddAccounts extends Migration {

  override name = 'Migration20261002202716_AddAccounts';

  override up(): void | Promise<void> {
    this.addSql(`create table \`accounts\` (\`id\` text not null primary key, \`name\` text not null, \`kind\` text not null default 'user', \`is_admin\` integer not null default false, \`password_hash\` text null, \`token_prefix\` text not null, \`token_hash\` text not null, \`created_at\` datetime not null, \`updated_at\` datetime not null);`);
    this.addSql(`create index \`accounts_token_prefix_index\` on \`accounts\` (\`token_prefix\`);`);
    this.addSql(`create unique index \`accounts_name_unique\` on \`accounts\` (\`name\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`accounts\`;`);
  }

}
