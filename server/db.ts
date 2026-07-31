// server/db.ts
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'scrims.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Scrim Blocks (Series vs Opponent)
  db.run(`
    CREATE TABLE IF NOT EXISTS scrim_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opponent_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);

  // 2. Individual Games within a Scrim Block
  db.run(`
    CREATE TABLE IF NOT EXISTS scrim_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER,
      game_number INTEGER DEFAULT 1,
      match_date TEXT DEFAULT CURRENT_TIMESTAMP,
      patch_version TEXT,
      our_side TEXT CHECK(our_side IN ('BLUE', 'RED')),
      result TEXT CHECK(result IN ('WIN', 'LOSS')),
      notes TEXT,
      FOREIGN KEY(block_id) REFERENCES scrim_blocks(id) ON DELETE CASCADE
    )
  `);

  // 3. Draft Picks
  db.run(`
    CREATE TABLE IF NOT EXISTS draft_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      champion_id TEXT,
      team TEXT CHECK(team IN ('OUR_TEAM', 'ENEMY')),
      role TEXT CHECK(role IN ('TOP', 'JNG', 'MID', 'BOT', 'SUP')),
      pick_phase TEXT CHECK(pick_phase IN ('P1', 'P2')),
      FOREIGN KEY(game_id) REFERENCES scrim_games(id) ON DELETE CASCADE
    )
  `);

  console.log('⚡ SQLite Database connected & scrim block schema initialized!');
});

export default db;