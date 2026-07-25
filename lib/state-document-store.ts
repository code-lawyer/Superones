import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

export type StateDocumentDefinition<T> = {
  namespace: string;
  fileName: string;
  create: () => T;
  parse: (value: unknown) => T;
};

const fileWriteChains = new Map<string, Promise<void>>();
let pool: Pool | undefined;

function databaseUrl() {
  return process.env.VAULT2077_DATABASE_URL || process.env.DATABASE_URL || "";
}

export function persistenceMode(): "postgresql" | "file-preview" {
  if (databaseUrl()) return "postgresql";
  if (process.env.NODE_ENV === "production" && process.env.VAULT2077_ALLOW_FILE_PREVIEW !== "true") {
    throw new Error("生产环境必须配置 VAULT2077_DATABASE_URL；文件存储只允许本地开发和预览。");
  }
  return "file-preview";
}

export function configuredPostgresPool() {
  if (pool) return pool;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error("PostgreSQL 连接未配置。");
  const sslMode = process.env.VAULT2077_DATABASE_SSL ?? "require";
  pool = new Pool({
    connectionString,
    max: Number(process.env.VAULT2077_DATABASE_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "allow-self-signed" },
  });
  pool.on("error", (error) => {
    console.error("PostgreSQL 连接池发生未处理错误。", error);
  });
  return pool;
}

function filePath(definition: StateDocumentDefinition<unknown>) {
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  return path.join(dataRoot, definition.fileName);
}

async function readFileDocument<T>(definition: StateDocumentDefinition<T>): Promise<T> {
  const target = filePath(definition);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    return definition.parse(JSON.parse(await readFile(target, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const initial = definition.create();
    await writeFile(target, `${JSON.stringify(initial, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      .catch((writeError: NodeJS.ErrnoException) => {
        if (writeError.code !== "EEXIST") throw writeError;
      });
    return definition.parse(JSON.parse(await readFile(target, "utf8")));
  }
}

async function writeFileDocument<T>(definition: StateDocumentDefinition<T>, value: T) {
  const target = filePath(definition);
  await mkdir(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, target);
}

async function readPostgresDocument<T>(definition: StateDocumentDefinition<T>): Promise<T> {
  const result = await configuredPostgresPool().query<{ document: unknown }>(
    "SELECT document FROM vault2077_state_documents WHERE namespace = $1",
    [definition.namespace],
  );
  return result.rowCount ? definition.parse(result.rows[0].document) : definition.create();
}

async function lockPostgresDocument<T>(client: PoolClient, definition: StateDocumentDefinition<T>) {
  await client.query(
    `INSERT INTO vault2077_state_documents (namespace, document)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (namespace) DO NOTHING`,
    [definition.namespace, JSON.stringify(definition.create())],
  );
  const result = await client.query<{ document: unknown }>(
    "SELECT document FROM vault2077_state_documents WHERE namespace = $1 FOR UPDATE",
    [definition.namespace],
  );
  if (!result.rowCount) throw new Error(`无法锁定状态文档 ${definition.namespace}。`);
  return definition.parse(result.rows[0].document);
}

export async function readStateDocument<T>(definition: StateDocumentDefinition<T>): Promise<T> {
  return persistenceMode() === "postgresql"
    ? readPostgresDocument(definition)
    : readFileDocument(definition);
}

export async function mutateStateDocument<T, R>(
  definition: StateDocumentDefinition<T>,
  mutator: (value: T) => R | Promise<R>,
): Promise<R> {
  if (persistenceMode() === "postgresql") {
    const client = await configuredPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const value = await lockPostgresDocument(client, definition);
      const result = await mutator(value);
      await client.query(
        `UPDATE vault2077_state_documents
         SET document = $2::jsonb, version = version + 1, updated_at = now()
         WHERE namespace = $1`,
        [definition.namespace, JSON.stringify(value)],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const previous = fileWriteChains.get(definition.namespace) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const value = await readFileDocument(definition);
    const result = await mutator(value);
    await writeFileDocument(definition, value);
    return result;
  });
  const chain = operation.then(() => undefined, () => undefined);
  fileWriteChains.set(definition.namespace, chain);
  try {
    return await operation;
  } finally {
    if (fileWriteChains.get(definition.namespace) === chain) fileWriteChains.delete(definition.namespace);
  }
}

export async function closePersistencePool() {
  if (!pool) return;
  const active = pool;
  pool = undefined;
  await active.end();
}
