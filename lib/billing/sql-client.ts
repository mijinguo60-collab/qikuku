export type SqlPrimitive = string | number | boolean | Date | null;

export interface SqlStatement<Row extends Record<string, SqlPrimitive | undefined> = Record<string, SqlPrimitive | undefined>> {
  get(...params: readonly SqlPrimitive[]): Promise<Row | null>;
  all(...params: readonly SqlPrimitive[]): Promise<Row[]>;
  run(...params: readonly SqlPrimitive[]): Promise<{ changes: number }>;
}

export interface SqlTransaction {
  prepare<Row extends Record<string, SqlPrimitive | undefined> = Record<string, SqlPrimitive | undefined>>(sql: string): SqlStatement<Row>;
}

export interface BillingSqlClient extends SqlTransaction {
  transactionAsync?<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T>;
}
