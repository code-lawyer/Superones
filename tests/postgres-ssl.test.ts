import assert from "node:assert/strict";
import test from "node:test";
import {
  postgresConnectionStringSslParameters,
  postgresSslConfiguration,
} from "../lib/postgres-ssl.mjs";

const connectionString = "postgresql://vault2077:secure@db.internal/vault2077";

test("PostgreSQL TLS configuration keeps one authoritative SSL control", () => {
  assert.deepEqual(postgresConnectionStringSslParameters(connectionString), []);
  assert.deepEqual(
    postgresSslConfiguration({ connectionString, mode: "require", production: true }),
    { rejectUnauthorized: true },
  );
  assert.equal(
    postgresSslConfiguration({ connectionString, mode: "disable" }),
    false,
  );
});

test("PostgreSQL TLS configuration rejects connection-string overrides before pg can apply them", () => {
  for (const query of [
    "sslmode=disable",
    "sslmode=no-verify",
    "sslmode=require&uselibpqcompat=true",
    "ssl=0",
    "sslcert=%2Ftmp%2Fclient.crt",
    "sslkey=%2Ftmp%2Fclient.key",
    "sslrootcert=%2Ftmp%2Fca.crt",
    "sslnegotiation=direct",
  ]) {
    assert.throws(
      () => postgresSslConfiguration({
        connectionString: `${connectionString}?${query}`,
        mode: "require",
        production: true,
      }),
      /不得包含 SSL 参数/,
      query,
    );
  }
});

test("PostgreSQL TLS configuration rejects weak or unknown production modes", () => {
  for (const mode of ["disable", "allow-self-signed", "prefer", "unknown"]) {
    assert.throws(
      () => postgresSslConfiguration({ connectionString, mode, production: true }),
      /生产 PostgreSQL 连接必须|配置无效/,
      mode,
    );
  }
});
