// api/index.ts
import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

// 1. GET: Champion Performance
app.get('/api/analytics/champions', async (req, res) => {
  const query = `
    SELECT 
      p.champion_id,
      p.role,
      COUNT(*) AS times_picked,
      SUM(CASE WHEN g.our_side = 'BLUE' THEN 1 ELSE 0 END) AS blue_picks,
      SUM(CASE WHEN g.our_side = 'RED' THEN 1 ELSE 0 END) AS red_picks,
      SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
      ROUND((CAST(SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS NUMERIC) / COUNT(*)) * 100, 1) AS win_rate
    FROM draft_picks p
    JOIN scrim_games g ON p.game_id = g.id
    JOIN scrim_blocks b ON g.block_id = b.id
    WHERE p.team = 'OUR_TEAM'
    GROUP BY p.champion_id, p.role
    ORDER BY times_picked DESC
  `;

  console.log('[DB READ] Fetching champion analytics...');
  const startTime = Date.now();

  try {
    const { rows } = await pool.query(query);
    const duration = Date.now() - startTime;
    console.log(`[DB READ SUCCESS] Champion analytics retrieved (${rows.length} rows) in ${duration}ms`);
    res.json(rows);
  } catch (err: any) {
    console.error('[DB READ ERROR] Champion analytics failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET: Head-to-Head Opponent Analytics
app.get('/api/analytics/opponents', async (req, res) => {
  const query = `
    SELECT 
      b.opponent_name,
      COUNT(g.id) AS games_played,
      SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
      ROUND((CAST(SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS NUMERIC) / COUNT(g.id)) * 100, 1) AS win_rate
    FROM scrim_blocks b
    JOIN scrim_games g ON b.id = g.block_id
    GROUP BY b.opponent_name
    ORDER BY games_played DESC
  `;

  console.log('[DB READ] Fetching opponent analytics...');
  const startTime = Date.now();

  try {
    const { rows } = await pool.query(query);
    const duration = Date.now() - startTime;
    console.log(`[DB READ SUCCESS] Opponent analytics retrieved (${rows.length} rows) in ${duration}ms`);
    res.json(rows);
  } catch (err: any) {
    console.error('[DB READ ERROR] Opponent analytics failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET: Fetch Scrim Blocks
app.get('/api/scrim-blocks', async (req, res) => {
  const queryBlocks = `SELECT * FROM scrim_blocks ORDER BY id DESC`;

  console.log('[DB READ] Fetching scrim blocks & game history...');
  const startTime = Date.now();

  try {
    const blocksResult = await pool.query(queryBlocks);
    const blocks = blocksResult.rows;

    const queryGames = `
      SELECT 
        g.id, g.block_id, g.game_number, g.our_side, g.result, g.patch_version,
        (
          SELECT STRING_AGG(role || ': ' || champion_id, ', ')
          FROM draft_picks WHERE game_id = g.id AND team = 'OUR_TEAM'
        ) AS our_draft,
        (
          SELECT STRING_AGG(role || ': ' || champion_id, ', ')
          FROM draft_picks WHERE game_id = g.id AND team = 'ENEMY'
        ) AS enemy_draft
      FROM scrim_games g
      ORDER BY g.game_number ASC
    `;

    const gamesResult = await pool.query(queryGames);
    const games = gamesResult.rows;

    const result = blocks.map((b: any) => ({
      ...b,
      games: games.filter((g: any) => g.block_id === b.id),
    }));

    const duration = Date.now() - startTime;
    console.log(`[DB READ SUCCESS] Scrim blocks retrieved (${blocks.length} blocks, ${games.length} games) in ${duration}ms`);

    res.json(result);
  } catch (err: any) {
    console.error('[DB READ ERROR] Scrim blocks fetch failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. POST: Save Scrim Block Series
app.post('/api/scrim-blocks', async (req, res) => {
  const { opponentName, notes, games } = req.body;

  try {
    const blockResult = await pool.query(
      `INSERT INTO scrim_blocks (opponent_name, notes) VALUES ($1, $2) RETURNING id`,
      [opponentName || 'Unknown Opponent', notes || '']
    );

    const blockId = blockResult.rows[0].id;

    if (games && Array.isArray(games)) {
      for (let idx = 0; idx < games.length; idx++) {
        const gameData = games[idx];
        const gameNumber = idx + 1;

        const gameResult = await pool.query(
          `INSERT INTO scrim_games (block_id, game_number, patch_version, our_side, result) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [blockId, gameNumber, gameData.patchVersion || '', gameData.ourSide, gameData.result]
        );

        const gameId = gameResult.rows[0].id;

        if (gameData.ourPicks) {
          for (const p of gameData.ourPicks) {
            await pool.query(
              `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES ($1, $2, $3, $4, $5)`,
              [gameId, p.championId, 'OUR_TEAM', p.role, 'P1']
            );
          }
        }

        if (gameData.enemyPicks) {
          for (const p of gameData.enemyPicks) {
            await pool.query(
              `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES ($1, $2, $3, $4, $5)`,
              [gameId, p.championId, 'ENEMY', p.role, 'P1']
            );
          }
        }
      }
    }

    console.log(`[DB WRITE SUCCESS] Created new Scrim Block #${blockId} with ${games?.length || 0} games.`);
    res.json({ success: true, blockId });
  } catch (err: any) {
    console.error('[DB WRITE ERROR] Failed to save scrim block:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. PUT: Update Scrim Block
app.put('/api/scrim-blocks/:id', async (req, res) => {
  const blockId = req.params.id;
  const { opponentName, notes, games } = req.body;

  try {
    await pool.query(
      `UPDATE scrim_blocks SET opponent_name = $1, notes = $2 WHERE id = $3`,
      [opponentName, notes, blockId]
    );

    const oldGames = await pool.query(`SELECT id FROM scrim_games WHERE block_id = $1`, [blockId]);
    const oldGameIds = oldGames.rows.map((g) => g.id);

    if (oldGameIds.length > 0) {
      await pool.query(`DELETE FROM draft_picks WHERE game_id = ANY($1::int[])`, [oldGameIds]);
    }

    await pool.query(`DELETE FROM scrim_games WHERE block_id = $1`, [blockId]);

    if (games && Array.isArray(games)) {
      for (let idx = 0; idx < games.length; idx++) {
        const gameData = games[idx];
        const gameNumber = idx + 1;

        const gameResult = await pool.query(
          `INSERT INTO scrim_games (block_id, game_number, patch_version, our_side, result) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [blockId, gameNumber, gameData.patchVersion || '', gameData.ourSide, gameData.result]
        );

        const gameId = gameResult.rows[0].id;

        if (gameData.ourPicks) {
          for (const p of gameData.ourPicks) {
            await pool.query(
              `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES ($1, $2, $3, $4, $5)`,
              [gameId, p.championId, 'OUR_TEAM', p.role, 'P1']
            );
          }
        }

        if (gameData.enemyPicks) {
          for (const p of gameData.enemyPicks) {
            await pool.query(
              `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES ($1, $2, $3, $4, $5)`,
              [gameId, p.championId, 'ENEMY', p.role, 'P1']
            );
          }
        }
      }
    }

    console.log(`[DB WRITE SUCCESS] Updated Scrim Block #${blockId}.`);
    res.json({ success: true, updatedBlockId: blockId });
  } catch (err: any) {
    console.error(`[DB WRITE ERROR] Failed to update scrim block #${blockId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE: Remove Scrim Block
app.delete('/api/scrim-blocks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const games = await pool.query(`SELECT id FROM scrim_games WHERE block_id = $1`, [id]);
    const gameIds = games.rows.map((g) => g.id);

    if (gameIds.length > 0) {
      await pool.query(`DELETE FROM draft_picks WHERE game_id = ANY($1::int[])`, [gameIds]);
      await pool.query(`DELETE FROM scrim_games WHERE block_id = $1`, [id]);
    }

    await pool.query(`DELETE FROM scrim_blocks WHERE id = $1`, [id]);
    console.log(`[DB WRITE SUCCESS] Deleted Scrim Block #${id}.`);
    res.json({ success: true, deletedBlockId: id });
  } catch (err: any) {
    console.error(`[DB WRITE ERROR] Failed to delete scrim block #${id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default serverless(app);