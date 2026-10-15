import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { nepthicEventsPool?: Pool };

if (!process.env.DATABASE_URL && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env in this project and fill it in.");
}

const pool = g.nepthicEventsPool ?? new Pool({ connectionString: process.env.DATABASE_URL?.trim().replace(/^([\'"])([\s\S]*)\1$/, "$2"), max: 10 });
if (process.env.NODE_ENV !== "production") g.nepthicEventsPool = pool;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export * from "./schema";
export { schema, pool };
export { and, asc, desc, eq, gt, gte, inArray, isNull, isNotNull, lt, lte, ne, not, or, sql, count, sum, ilike } from "drizzle-orm";
