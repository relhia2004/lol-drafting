// api/db.ts
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  // 🎯 CRITICAL SERVERLESS POOL SETTINGS
  max: 1,                   // Limit each serverless function to 1 connection
  idleTimeoutMillis: 1000,  // Close idle connection quickly after request finishes
  connectionTimeoutMillis: 10000, // Give up to 10 seconds to connect
});