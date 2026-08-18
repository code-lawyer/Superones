export type PostgresSslMode = "require" | "disable" | "allow-self-signed";

export function postgresConnectionStringSslParameters(connectionString: string): string[];

export function postgresSslConfiguration(input: {
  connectionString: string;
  mode?: string;
  production?: boolean;
}): false | { rejectUnauthorized: boolean };
