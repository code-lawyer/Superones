const supportedModes = new Set(["require", "disable", "allow-self-signed"]);

const connectionStringSslParameters = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslnegotiation",
  "sslrootcert",
  "uselibpqcompat",
]);

export function postgresConnectionStringSslParameters(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("PostgreSQL 连接串不是有效 URL。");
  }
  return [...new Set(
    [...url.searchParams.keys()]
      .map((name) => name.toLowerCase())
      .filter((name) => connectionStringSslParameters.has(name)),
  )].sort();
}

export function postgresSslConfiguration({ connectionString, mode = "require", production = false }) {
  if (!supportedModes.has(mode)) {
    throw new Error("VAULT2077_DATABASE_SSL 配置无效。");
  }

  const conflictingParameters = postgresConnectionStringSslParameters(connectionString);
  if (conflictingParameters.length > 0) {
    throw new Error(
      `PostgreSQL 连接串不得包含 SSL 参数（${conflictingParameters.join(", ")}）；请只使用 VAULT2077_DATABASE_SSL。`,
    );
  }

  if (production && mode !== "require") {
    throw new Error("生产 PostgreSQL 连接必须校验证书链和数据库主机名。");
  }

  return mode === "disable"
    ? false
    : { rejectUnauthorized: mode !== "allow-self-signed" };
}
