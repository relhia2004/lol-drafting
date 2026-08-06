import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import { supabase } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

// 1. GET: Champion Performance
app.get('/api/analytics/champions', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_champion_analytics');
    
    // Fallback direct table query if RPC is not created yet
    if (error) {
      const { data: rawPicks, error: fetchErr } = await supabase
        .from('draft_picks')
        .select(`
          champion_id,
          role,
          team,
          scrim_games!inner (
            our_side,
            result
          )
        `)
        .eq('team', 'OUR_TEAM');

      if (fetchErr) throw fetchErr;

      // Group and calculate stats in JS to avoid raw TCP requirements
      const statsMap: Record<string, any> = {};

      rawPicks?.forEach((pick: any) => {
        const key = `${pick.champion_id}-${pick.role}`;
        if (!statsMap[key]) {
          statsMap[key] = {
            champion_id: pick.champion_id,
            role: pick.role,
            times_picked: 0,
            blue_picks: 0,
            red_picks: 0,
            wins: 0,
            losses: 0,
            win_rate: 0,
          };
        }

        const stat = statsMap[key];
        stat.times_picked += 1;
        if (pick.scrim_games.our_side === 'BLUE') stat.blue_picks += 1;
        if (pick.scrim_games.our_side === 'RED') stat.red_picks += 1;
        if (pick.scrim_games.result === 'WIN') stat.wins += 1;
        if (pick.scrim_games.result === 'LOSS') stat.losses += 1;
        stat.win_rate = Number(((stat.wins / stat.times_picked) * 100).toFixed(1));
      });

      return res.json(Object.values(statsMap));
    }

    res.json(data);
  } catch (err: any) {
    console.error('[HTTP ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET: Head-to-Head Opponent Analytics
app.get('/api/analytics/opponents', async (req, res) => {
  try {
    const { data: blocks, error } = await supabase
      .from('scrim_blocks')
      .select(`
        opponent_name,
        scrim_games (
          id,
          result
        )
      `);

    if (error) throw error;

    const oppMap: Record<string, any> = {};

    blocks?.forEach((b: any) => {
      const name = b.opponent_name;
      if (!oppMap[name]) {
        oppMap[name] = { opponent_name: name, games_played: 0, wins: 0, losses: 0, win_rate: 0 };
      }

      b.scrim_games?.forEach((g: any) => {
        oppMap[name].games_played += 1;
        if (g.result === 'WIN') oppMap[name].wins += 1;
        if (g.result === 'LOSS') oppMap[name].losses += 1;
      });

      if (oppMap[name].games_played > 0) {
        oppMap[name].win_rate = Number(((oppMap[name].wins / oppMap[name].games_played) * 100).toFixed(1));
      }
    });

    res.json(Object.values(oppMap));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET: Fetch Scrim Blocks
app.get('/api/scrim-blocks', async (req, res) => {
  try {
    const { data: blocks, error: blockErr } = await supabase
      .from('scrim_blocks')
      .select('*')
      .order('id', { ascending: false });

    if (blockErr) throw blockErr;

    const { data: games, error: gameErr } = await supabase
      .from('scrim_games')
      .select(`
        id, block_id, game_number, our_side, result, patch_version,
        draft_picks (
          champion_id, role, team
        )
      `)
      .order('game_number', { ascending: true });

    if (gameErr) throw gameErr;

    const result = blocks?.map((b: any) => ({
      ...b,
      games: games
        ?.filter((g: any) => g.block_id === b.id)
        .map((g: any) => {
          const ourPicks = g.draft_picks?.filter((p: any) => p.team === 'OUR_TEAM') || [];
          const enemyPicks = g.draft_picks?.filter((p: any) => p.team === 'ENEMY') || [];

          return {
            ...g,
            our_draft: ourPicks.map((p: any) => `${p.role}: ${p.champion_id}`).join(', '),
            enemy_draft: enemyPicks.map((p: any) => `${p.role}: ${p.champion_id}`).join(', '),
          };
        }),
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST: Save Scrim Block Series
app.post('/api/scrim-blocks', async (req, res) => {
  const { opponentName, notes, games } = req.body;

  try {
    // 1. Insert Scrim Block
    const { data: block, error: blockErr } = await supabase
      .from('scrim_blocks')
      .insert({ opponent_name: opponentName || 'Unknown Opponent', notes: notes || '' })
      .select('id')
      .single();

    if (blockErr) throw blockErr;
    const blockId = block.id;

    // 2. Insert Games & Draft Picks over HTTPS
    if (games && Array.isArray(games)) {
      for (let idx = 0; idx < games.length; idx++) {
        const gameData = games[idx];
        const gameNumber = idx + 1;

        const { data: game, error: gameErr } = await supabase
          .from('scrim_games')
          .insert({
            block_id: blockId,
            game_number: gameNumber,
            patch_version: gameData.patchVersion || '',
            our_side: gameData.ourSide,
            result: gameData.result,
          })
          .select('id')
          .single();

        if (gameErr) throw gameErr;
        const gameId = game.id;

        const picksToInsert: any[] = [];

        if (gameData.ourPicks) {
          gameData.ourPicks.forEach((p: any) => {
            picksToInsert.push({ game_id: gameId, champion_id: p.championId, team: 'OUR_TEAM', role: p.role, pick_phase: 'P1' });
          });
        }

        if (gameData.enemyPicks) {
          gameData.enemyPicks.forEach((p: any) => {
            picksToInsert.push({ game_id: gameId, champion_id: p.championId, team: 'ENEMY', role: p.role, pick_phase: 'P1' });
          });
        }

        if (picksToInsert.length > 0) {
          const { error: pickErr } = await supabase.from('draft_picks').insert(picksToInsert);
          if (pickErr) throw pickErr;
        }
      }
    }

    console.log(`[HTTP SUCCESS] Saved Scrim Block #${blockId}`);
    res.json({ success: true, blockId });
  } catch (err: any) {
    console.error('[HTTP POST ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. PUT: Update Scrim Block
app.put('/api/scrim-blocks/:id', async (req, res) => {
  const blockId = req.params.id;
  const { opponentName, notes, games } = req.body;

  try {
    await supabase
      .from('scrim_blocks')
      .update({ opponent_name: opponentName, notes: notes })
      .eq('id', blockId);

    // Delete existing games (Cascade deletes draft_picks if FK set, or manually delete)
    const { data: oldGames } = await supabase.from('scrim_games').select('id').eq('block_id', blockId);
    const oldGameIds = oldGames?.map((g) => g.id) || [];

    if (oldGameIds.length > 0) {
      await supabase.from('draft_picks').delete().in('game_id', oldGameIds);
    }
    await supabase.from('scrim_games').delete().eq('block_id', blockId);

    // Re-insert games
    if (games && Array.isArray(games)) {
      for (let idx = 0; idx < games.length; idx++) {
        const gameData = games[idx];
        const gameNumber = idx + 1;

        const { data: game, error: gameErr } = await supabase
          .from('scrim_games')
          .insert({
            block_id: blockId,
            game_number: gameNumber,
            patch_version: gameData.patchVersion || '',
            our_side: gameData.ourSide,
            result: gameData.result,
          })
          .select('id')
          .single();

        if (gameErr) throw gameErr;
        const gameId = game.id;

        const picksToInsert: any[] = [];
        if (gameData.ourPicks) {
          gameData.ourPicks.forEach((p: any) => {
            picksToInsert.push({ game_id: gameId, champion_id: p.championId, team: 'OUR_TEAM', role: p.role, pick_phase: 'P1' });
          });
        }
        if (gameData.enemyPicks) {
          gameData.enemyPicks.forEach((p: any) => {
            picksToInsert.push({ game_id: gameId, champion_id: p.championId, team: 'ENEMY', role: p.role, pick_phase: 'P1' });
          });
        }

        if (picksToInsert.length > 0) {
          await supabase.from('draft_picks').insert(picksToInsert);
        }
      }
    }

    res.json({ success: true, updatedBlockId: blockId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE: Remove Scrim Block
app.delete('/api/scrim-blocks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: games } = await supabase.from('scrim_games').select('id').eq('block_id', id);
    const gameIds = games?.map((g) => g.id) || [];

    if (gameIds.length > 0) {
      await supabase.from('draft_picks').delete().in('game_id', gameIds);
      await supabase.from('scrim_games').delete().eq('block_id', id);
    }

    await supabase.from('scrim_blocks').delete().eq('id', id);
    res.json({ success: true, deletedBlockId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default app;