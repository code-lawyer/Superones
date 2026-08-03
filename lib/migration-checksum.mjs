import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeMigrationSql(sql) {
  return sql.replace(/\r\n?/g, "\n");
}

export function migrationChecksum(sql) {
  return sha256(normalizeMigrationSql(sql));
}

export function acceptedMigrationChecksums(sql) {
  const normalized = normalizeMigrationSql(sql);
  return new Set([
    migrationChecksum(sql),
    sha256(sql),
    sha256(normalized.replace(/\n/g, "\r\n")),
  ]);
}
