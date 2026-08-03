export function normalizeMigrationSql(sql: string): string;

export function migrationChecksum(sql: string): string;

export function acceptedMigrationChecksums(sql: string): Set<string>;
