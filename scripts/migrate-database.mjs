import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  acceptedMigrationChecksums,
  migrationChecksum,
} from "../lib/migration-checksum.mjs";

const connectionString = process.env.VAULT2077_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("请设置 VAULT2077_DATABASE_URL 后再运行数据库迁移。");

const sslMode = process.env.VAULT2077_DATABASE_SSL ?? "require";
const client = new pg.Client({
  connectionString,
  ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "allow-self-signed" },
});
const migrationsDirectory = path.join(process.cwd(), "migrations");

await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('vault2077-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS vault2077_schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
    const checksum = migrationChecksum(sql);
    const existing = await client.query(
      "SELECT checksum FROM vault2077_schema_migrations WHERE name = $1",
      [name],
    );
    if (existing.rowCount) {
      if (!acceptedMigrationChecksums(sql).has(existing.rows[0].checksum)) {
        throw new Error(`已应用迁移 ${name} 的校验值发生变化；请新增迁移，不要修改历史文件。`);
      }
      console.log(`skip ${name}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO vault2077_schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log(`applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('vault2077-migrations'))").catch(() => undefined);
  await client.end();
}
