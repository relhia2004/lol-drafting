// api/index.ts
import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import db from '../server/db';

const app = express();
app.use(cors());
app.use(express.json());

// Enable SQLite Foreign Key Support
db.run('PRAGMA foreign_keys = ON;');

// 1. GET: Champion Performance
app.get('/api/analytics/champions', (req, res) => {
  const query = `
    SELECT 
      p.champion_id,
      p.role,
      COUNT(*) AS times_picked,
      SUM(CASE WHEN g.our_side = 'BLUE' THEN 1 ELSE 0 END) AS blue_picks,
      SUM(CASE WHEN g.our_side = 'RED' THEN 1 ELSE 0 END) AS red_picks,
      SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
      ROUND((CAST(SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)) * 100, 1) AS win_rate
    FROM draft_picks p
    JOIN scrim_games g ON p.game_id = g.id
    JOIN scrim_blocks b ON g.block_id = b.id
    WHERE p.team = 'OUR_TEAM'
    GROUP BY p.champion_id, p.role
    ORDER BY times_picked DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 2. GET: Head-to-Head Opponent Analytics
app.get('/api/analytics/opponents', (req, res) => {
  const query = `
    SELECT 
      b.opponent_name,
      COUNT(g.id) AS games_played,
      SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
      ROUND((CAST(SUM(CASE WHEN g.result = 'WIN' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(g.id)) * 100, 1) AS win_rate
    FROM scrim_blocks b
    JOIN scrim_games g ON b.id = g.block_id
    GROUP BY b.opponent_name
    ORDER BY games_played DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 3. GET: Fetch Scrim Blocks
app.get('/api/scrim-blocks', (req, res) => {
  const queryBlocks = `SELECT * FROM scrim_blocks ORDER BY id DESC`;

  db.all(queryBlocks, [], (err, blocks) => {
    if (err) return res.status(500).json({ error: err.message });

    const queryGames = `
      SELECT 
        g.id, g.block_id, g.game_number, g.our_side, g.result, g.patch_version,
        (
          SELECT GROUP_CONCAT(role || ': ' || champion_id, ', ')
          FROM draft_picks WHERE game_id = g.id AND team = 'OUR_TEAM'
        ) AS our_draft,
        (
          SELECT GROUP_CONCAT(role || ': ' || champion_id, ', ')
          FROM draft_picks WHERE game_id = g.id AND team = 'ENEMY'
        ) AS enemy_draft
      FROM scrim_games g
      ORDER BY g.game_number ASC
    `;

    db.all(queryGames, [], (err, games) => {
      if (err) return res.status(500).json({ error: err.message });

      const result = blocks.map((b: any) => ({
        ...b,
        games: games.filter((g: any) => g.block_id === b.id),
      }));

      res.json(result);
    });
  });
});

// 4. POST: Save Scrim Block Series
app.post('/api/scrim-blocks', (req, res) => {
  const { opponentName, notes, games } = req.body;

  db.run(
    `INSERT INTO scrim_blocks (opponent_name, notes) VALUES (?, ?)`,
    [opponentName || 'Unknown Opponent', notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const blockId = this.lastID;

      if (!games || !Array.isArray(games)) {
        return res.json({ success: true, blockId });
      }

      games.forEach((gameData: any, idx: number) => {
        const gameNumber = idx + 1;
        db.run(
          `INSERT INTO scrim_games (block_id, game_number, patch_version, our_side, result) VALUES (?, ?, ?, ?, ?)`,
          [blockId, gameNumber, gameData.patchVersion || '', gameData.ourSide, gameData.result],
          function (err) {
            if (err) return;
            const gameId = this.lastID;
            const pickStmt = db.prepare(
              `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES (?, ?, ?, ?, ?)`
            );

            if (gameData.ourPicks) {
              gameData.ourPicks.forEach((p: any) => pickStmt.run(gameId, p.championId, 'OUR_TEAM', p.role, 'P1'));
            }
            if (gameData.enemyPicks) {
              gameData.enemyPicks.forEach((p: any) => pickStmt.run(gameId, p.championId, 'ENEMY', p.role, 'P1'));
            }

            pickStmt.finalize();
          }
        );
      });

      res.json({ success: true, blockId });
    }
  );
});

// 5. PUT: Update Scrim Block
app.put('/api/scrim-blocks/:id', (req, res) => {
  const blockId = req.params.id;
  const { opponentName, notes, games } = req.body;

  db.run(
    `UPDATE scrim_blocks SET opponent_name = ?, notes = ? WHERE id = ?`,
    [opponentName, notes, blockId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      db.all(`SELECT id FROM scrim_games WHERE block_id = ?`, [blockId], (err, oldGames: any[]) => {
        if (err) return res.status(500).json({ error: err.message });

        const oldGameIds = oldGames.map((g) => g.id);
        if (oldGameIds.length > 0) {
          const placeholders = oldGameIds.map(() => '?').join(',');
          db.run(`DELETE FROM draft_picks WHERE game_id IN (${placeholders})`, oldGameIds);
        }

        db.run(`DELETE FROM scrim_games WHERE block_id = ?`, [blockId], function (err) {
          if (err) return res.status(500).json({ error: err.message });

          games.forEach((gameData: any, idx: number) => {
            const gameNumber = idx + 1;
            db.run(
              `INSERT INTO scrim_games (block_id, game_number, patch_version, our_side, result) VALUES (?, ?, ?, ?, ?)`,
              [blockId, gameNumber, gameData.patchVersion || '', gameData.ourSide, gameData.result],
              function (err) {
                if (err) return;
                const gameId = this.lastID;
                const pickStmt = db.prepare(
                  `INSERT INTO draft_picks (game_id, champion_id, team, role, pick_phase) VALUES (?, ?, ?, ?, ?)`
                );

                if (gameData.ourPicks) {
                  gameData.ourPicks.forEach((p: any) => pickStmt.run(gameId, p.championId, 'OUR_TEAM', p.role, 'P1'));
                }
                if (gameData.enemyPicks) {
                  gameData.enemyPicks.forEach((p: any) => pickStmt.run(gameId, p.championId, 'ENEMY', p.role, 'P1'));
                }

                pickStmt.finalize();
              }
            );
          });

          res.json({ success: true, updatedBlockId: blockId });
        });
      });
    }
  );
});

// 6. DELETE: Remove Scrim Block
app.delete('/api/scrim-blocks/:id', (req, res) => {
  const { id } = req.params;

  db.all(`SELECT id FROM scrim_games WHERE block_id = ?`, [id], (err, games: any[]) => {
    if (err) return res.status(500).json({ error: err.message });

    const gameIds = games ? games.map((g) => g.id) : [];

    if (gameIds.length > 0) {
      const placeholders = gameIds.map(() => '?').join(',');
      db.run(`DELETE FROM draft_picks WHERE game_id IN (${placeholders})`, gameIds, (err) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run(`DELETE FROM scrim_games WHERE block_id = ?`, [id], (err) => {
          if (err) return res.status(500).json({ error: err.message });

          db.run(`DELETE FROM scrim_blocks WHERE id = ?`, [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deletedBlockId: id });
          });
        });
      });
    } else {
      db.run(`DELETE FROM scrim_blocks WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deletedBlockId: id });
      });
    }
  });
});

export default serverless(app);