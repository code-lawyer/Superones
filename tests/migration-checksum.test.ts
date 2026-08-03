import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  acceptedMigrationChecksums,
  migrationChecksum,
  normalizeMigrationSql,
} from "../lib/migration-checksum.mjs";

const lfSql = "CREATE TABLE example (\n  id bigint PRIMARY KEY\n);\n";
const crlfSql = lfSql.replace(/\n/g, "\r\n");

function rawChecksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

test("migration checksums are stable across LF and CRLF checkouts", () => {
  assert.equal(normalizeMigrationSql(crlfSql), lfSql);
  assert.equal(migrationChecksum(lfSql), migrationChecksum(crlfSql));
});

test("migration checksum compatibility accepts legacy raw line-ending hashes", () => {
  const accepted = acceptedMigrationChecksums(lfSql);

  assert.equal(accepted.has(rawChecksum(lfSql)), true);
  assert.equal(accepted.has(rawChecksum(crlfSql)), true);
});

test("migration checksum compatibility still rejects SQL changes", () => {
  const changedSql = lfSql.replace("bigint", "integer");

  assert.equal(
    acceptedMigrationChecksums(lfSql).has(rawChecksum(changedSql)),
    false,
  );
});
