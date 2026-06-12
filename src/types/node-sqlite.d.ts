// Minimal type declarations for Node's built-in SQLite module (node:sqlite).
// Experimental in Node 22, so @types/node does not yet ship these.
declare module "node:sqlite" {
  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }
  class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get<T = Record<string, unknown>>(...params: unknown[]): T | undefined;
    all<T = Record<string, unknown>>(...params: unknown[]): T[];
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
