declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }
  export interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string): { columns: string[]; values: unknown[][] }[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }
  export interface Statement {
    bind(params: unknown[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }
  export default function initSqlJs(options?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
}
