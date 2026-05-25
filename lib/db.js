import { Pool } from "pg";

let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.POSTGRES_URL) return null;
    pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 5 });
  }
  return pool;
}
