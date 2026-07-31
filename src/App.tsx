import React, { useEffect, useState } from 'react';
import { Search, PlusCircle, Trophy, X, BarChart3, Users, Trash2, Swords, Edit3, Plus, Layers } from 'lucide-react';

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  iconUrl: string;
}

export interface ChampionStat {
  champion_id: string;
  role: string;
  times_picked: number;
  blue_picks: number;
  red_picks: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface OpponentStat {
  opponent_name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface GameData {
  id?: number;
  game_number?: number;
  ourSide: 'BLUE' | 'RED';
  result: 'WIN' | 'LOSS';
  ourDraft: { TOP: string; JNG: string; MID: string; BOT: string; SUP: string };
  enemyDraft: { TOP: string; JNG: string; MID: string; BOT: string; SUP: string };
  our_draft?: string;
  enemy_draft?: string;
  our_side?: 'BLUE' | 'RED';
}

export interface ScrimBlock {
  id: number;
  opponent_name: string;
  created_at: string;
  games: GameData[];
}

const BASE_URL = 'https://ddragon.leagueoflegends.com';

async function fetchLatestVersion(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/versions.json`);
  const versions: string[] = await res.json();
  return versions[0];
}

async function fetchAllChampions(): Promise<{ version: string; champions: Champion[] }> {
  const version = await fetchLatestVersion();
  const res = await fetch(`${BASE_URL}/cdn/${version}/data/en_US/champion.json`);
  const data = await res.json();

  const championList: Champion[] = Object.values(data.data)
    .filter((champ: any) => !champ.id.startsWith('LeagueClassic') && !champ.id.includes('_'))
    .map((champ: any) => ({
      id: champ.id,
      key: champ.key,
      name: champ.name,
      title: champ.title,
      tags: champ.tags,
      iconUrl: `${BASE_URL}/cdn/${version}/img/champion/${champ.image.full}`,
    }));

  return { version, champions: championList };
}

export default function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [patchVersion, setPatchVersion] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'GRID' | 'ANALYTICS'>('GRID');

  // Edit Tracking
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);

  // Analytics Data
  const [stats, setStats] = useState<ChampionStat[]>([]);
  const [opponents, setOpponents] = useState<OpponentStat[]>([]);
  const [scrimBlocks, setScrimBlocks] = useState<ScrimBlock[]>([]);

  // Form State for Scrim Block
  const [opponent, setOpponent] = useState('');
  const [activeGameIndex, setActiveGameIndex] = useState<number>(0);

  // Array of games inside this scrim block
  const [games, setGames] = useState<GameData[]>([
    {
      ourSide: 'BLUE',
      result: 'WIN',
      ourDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
      enemyDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
    },
  ]);

  const loadAnalytics = async () => {
    try {
      const [statsRes, oppRes, blocksRes] = await Promise.all([
        fetch('/api/analytics/champions'),
        fetch('/api/analytics/opponents'),
        fetch('/api/scrim-blocks'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (oppRes.ok) setOpponents(await oppRes.json());
      if (blocksRes.ok) setScrimBlocks(await blocksRes.json());
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  useEffect(() => {
    fetchAllChampions().then(({ version, champions }) => {
      setPatchVersion(version);
      setChampions(champions);
      setLoading(false);
    });
    loadAnalytics();
  }, []);

  const resetForm = () => {
    setEditingBlockId(null);
    setOpponent('');
    setActiveGameIndex(0);
    setGames([
      {
        ourSide: 'BLUE',
        result: 'WIN',
        ourDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
        enemyDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
      },
    ]);
  };

  const handleAddGameTab = () => {
    setGames((prev) => [
      ...prev,
      {
        ourSide: 'RED',
        result: 'WIN',
        ourDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
        enemyDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
      },
    ]);
    setActiveGameIndex(games.length);
  };

  const handleRemoveGameTab = (index: number) => {
    if (games.length === 1) {
      alert('A scrim block must contain at least 1 game.');
      return;
    }
    const updated = games.filter((_, i) => i !== index);
    setGames(updated);
    setActiveGameIndex(Math.max(0, index - 1));
  };

  const handleOpenEditModal = (block: ScrimBlock) => {
    setEditingBlockId(block.id);
    setOpponent(block.opponent_name);

    const parseDraft = (draftStr?: string) => {
      const draftObj = { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' };
      if (!draftStr) return draftObj;

      draftStr.split(', ').forEach((item) => {
        const [role, champId] = item.split(': ');
        if (role && champId && role in draftObj) {
          draftObj[role as keyof typeof draftObj] = champId;
        }
      });
      return draftObj;
    };

    const loadedGames: GameData[] = block.games.map((g) => ({
      ourSide: g.our_side || 'BLUE',
      result: g.result || 'WIN',
      ourDraft: parseDraft(g.our_draft),
      enemyDraft: parseDraft(g.enemy_draft),
    }));

    setGames(loadedGames.length > 0 ? loadedGames : [
      {
        ourSide: 'BLUE',
        result: 'WIN',
        ourDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
        enemyDraft: { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' },
      }
    ]);
    setActiveGameIndex(0);
    setIsModalOpen(true);
  };

  const handleSaveScrimBlock = async () => {
    if (!opponent.trim()) {
      alert('Please enter an Opponent Team name!');
      return;
    }

    const formattedGames = games.map((g) => ({
      patchVersion,
      ourSide: g.ourSide,
      result: g.result,
      ourPicks: Object.entries(g.ourDraft)
        .filter(([_, cid]) => cid !== '')
        .map(([role, cid]) => ({ championId: cid, role })),
      enemyPicks: Object.entries(g.enemyDraft)
        .filter(([_, cid]) => cid !== '')
        .map(([role, cid]) => ({ championId: cid, role })),
    }));

    const payload = {
      opponentName: opponent,
      notes: 'Logged Scrim Block',
      games: formattedGames,
    };

    const url = editingBlockId
      ? `api/scrim-blocks/${editingBlockId}`
      : '/scrim-blocks';

    const method = editingBlockId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert(editingBlockId ? '✏️ Scrim Block updated!' : '🎯 Scrim Block recorded successfully!');
        setIsModalOpen(false);
        resetForm();
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend server!');
    }
  };

  const handleDeleteScrimBlock = async (blockId: number) => {
    if (!confirm('Are you sure you want to delete this entire scrim block?')) return;

    try {
      const res = await fetch(`/api/scrim-blocks/${blockId}`, { method: 'DELETE' });
      if (res.ok) loadAnalytics();
    } catch (err) {
      console.error('Failed to delete scrim block:', err);
      alert('Failed to delete scrim block!');
    }
  };

  const updateCurrentGame = (field: keyof GameData, value: any) => {
    setGames((prev) => {
      const updated = [...prev];
      updated[activeGameIndex] = { ...updated[activeGameIndex], [field]: value };
      return updated;
    });
  };

  const filteredChampions = champions.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <p className="text-xl animate-pulse">Loading League Champions from DataDragon...</p>
      </div>
    );
  }

  const currentGame = games[activeGameIndex] || games[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header Bar */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-blue-400">
            LoL Coach Analytics <span className="text-xs text-slate-400">v{patchVersion}</span>
          </h1>
          <p className="text-sm text-slate-400">Multi-Game Scrim Block Series Analytics</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('GRID')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeTab === 'GRID' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Champions
            </button>
            <button
              onClick={() => setActiveTab('ANALYTICS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeTab === 'ANALYTICS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Scrim Stats
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
          >
            <PlusCircle className="w-4 h-4" /> Log Scrim Block
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto space-y-6">
        {activeTab === 'GRID' ? (
          <div>
            <div className="mb-4 relative max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search champion..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {filteredChampions.map((champ) => (
                <div
                  key={champ.id}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500 rounded-xl p-2 transition cursor-pointer flex flex-col items-center"
                >
                  <img src={champ.iconUrl} alt={champ.name} className="w-16 h-16 rounded-lg" />
                  <span className="mt-2 text-xs font-semibold text-slate-200 truncate w-full text-center">
                    {champ.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Opponent Records */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Swords className="text-rose-400 w-5 h-5" /> Head-to-Head Opponent Records
              </h2>

              {opponents.length === 0 ? (
                <p className="text-slate-400 text-sm">No opponent data yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {opponents.map((opp) => (
                    <div
                      key={opp.opponent_name}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Opponent Team
                        </span>
                        <h3 className="text-lg font-bold text-white mt-0.5">{opp.opponent_name}</h3>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
                        <div>
                          <p className="text-xs text-slate-400">Total Games</p>
                          <p className="text-sm font-bold text-slate-200">{opp.games_played} Games</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Record</p>
                          <p className="text-sm font-bold">
                            <span className="text-emerald-400">{opp.wins}W</span> -{' '}
                            <span className="text-rose-400">{opp.losses}L</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Win Rate</p>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              opp.win_rate >= 50
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {opp.win_rate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Champion Stats Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="text-blue-400 w-5 h-5" /> Our Champion Performance
              </h2>

              {stats.length === 0 ? (
                <p className="text-slate-400 text-sm">No champion stats logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-xs text-slate-400 uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Champion</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Times Picked</th>
                        <th className="py-3 px-4">Side (Blue / Red)</th>
                        <th className="py-3 px-4">Record (W-L)</th>
                        <th className="py-3 px-4">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {stats.map((s, index) => {
                        const champData = champions.find((c) => c.id === s.champion_id);
                        return (
                          <tr key={`${s.champion_id}-${s.role}-${index}`} className="hover:bg-slate-800/50 transition">
                            <td className="py-3 px-4 flex items-center gap-3">
                              {champData && (
                                <img src={champData.iconUrl} alt={s.champion_id} className="w-8 h-8 rounded" />
                              )}
                              <span className="font-semibold text-white">{champData?.name || s.champion_id}</span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-blue-400">
                                {s.role || 'ANY'}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono">{s.times_picked}</td>

                            <td className="py-3 px-4 font-semibold text-xs">
                              <span className="text-blue-400">{s.blue_picks ?? 0} Blue</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-rose-400">{s.red_picks ?? 0} Red</span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="text-emerald-400 font-semibold">{s.wins}W</span> -{' '}
                              <span className="text-rose-400 font-semibold">{s.losses}L</span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold ${
                                  s.win_rate >= 50
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {s.win_rate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Scrim Block History */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="text-blue-400 w-5 h-5" /> Scrim Block History
              </h2>

              {scrimBlocks.length === 0 ? (
                <p className="text-slate-400 text-sm">No scrim blocks logged yet.</p>
              ) : (
                <div className="space-y-4">
                  {scrimBlocks.map((block) => {
                    const blockWins = block.games.filter((g) => g.result === 'WIN').length;
                    const blockLosses = block.games.filter((g) => g.result === 'LOSS').length;

                    return (
                      <div key={block.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-lg text-white">
                              vs {block.opponent_name}
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Series Record: {blockWins}W - {blockLosses}L ({block.games.length} Games)
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditModal(block)}
                              className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition"
                              title="Edit Scrim Block"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteScrimBlock(block.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                              title="Delete Scrim Block"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Individual Games List */}
                        <div className="space-y-3">
                          {block.games.map((game, idx) => (
                            <div
                              key={game.id || idx}
                              className="bg-slate-900 border border-slate-800/80 rounded-lg p-3"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-bold text-xs text-blue-400">
                                  Game {game.game_number || idx + 1}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    game.result === 'WIN'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {game.result}
                                </span>
                                <span className="text-xs text-slate-400">({game.our_side} Side)</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                <div className="bg-blue-950/30 border border-blue-900/40 rounded p-2">
                                  <span className="font-bold text-blue-400 block mb-0.5">Our Draft:</span>
                                  <span className="text-slate-200">{game.our_draft || 'None'}</span>
                                </div>
                                <div className="bg-rose-950/30 border border-rose-900/40 rounded p-2">
                                  <span className="font-bold text-rose-400 block mb-0.5">Enemy Draft:</span>
                                  <span className="text-slate-200">{game.enemy_draft || 'None'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Log / Edit Multi-Game Scrim Block Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-3xl relative my-8">
            <button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="text-yellow-400 w-5 h-5" />
              {editingBlockId ? 'Edit Scrim Block Series' : 'Record Scrim Block Series'}
            </h2>

            <div className="space-y-4">
              {/* Opponent Input */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">Opponent Team Name</label>
                <input
                  type="text"
                  placeholder="e.g. Team Secret"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white"
                />
              </div>

              {/* Game Tabs with + Add Game Button */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                {games.map((_, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveGameIndex(index)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                        activeGameIndex === index
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Game {index + 1}
                    </button>
                    {games.length > 1 && (
                      <button
                        onClick={() => handleRemoveGameTab(index)}
                        className="text-slate-500 hover:text-rose-400 p-0.5"
                        title="Remove Game"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={handleAddGameTab}
                  className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition ml-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Game {games.length + 1}
                </button>
              </div>

              {/* Current Active Game Settings */}
              <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-blue-400">Configuring Game {activeGameIndex + 1}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Our Side</label>
                    <select
                      value={currentGame.ourSide}
                      onChange={(e) => updateCurrentGame('ourSide', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      <option value="BLUE">Blue Side</option>
                      <option value="RED">Red Side</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Outcome</label>
                    <select
                      value={currentGame.result}
                      onChange={(e) => updateCurrentGame('result', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      <option value="WIN">Victory (WIN)</option>
                      <option value="LOSS">Defeat (LOSS)</option>
                    </select>
                  </div>
                </div>

                {/* Draft Picks for Current Game */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Our Draft */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-blue-900/40 space-y-2">
                    <span className="text-xs font-bold text-blue-400 block border-b border-slate-800 pb-1">
                      Our Team Draft (Game {activeGameIndex + 1})
                    </span>
                    {(['TOP', 'JNG', 'MID', 'BOT', 'SUP'] as const).map((role) => (
                      <div key={`our-${role}`} className="flex items-center gap-2">
                        <span className="w-10 text-[10px] font-mono font-bold text-slate-400">{role}</span>
                        <select
                          value={currentGame.ourDraft[role]}
                          onChange={(e) =>
                            updateCurrentGame('ourDraft', {
                              ...currentGame.ourDraft,
                              [role]: e.target.value,
                            })
                          }
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                        >
                          <option value="">Select Champion...</option>
                          {champions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Enemy Draft */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-rose-900/40 space-y-2">
                    <span className="text-xs font-bold text-rose-400 block border-b border-slate-800 pb-1">
                      Enemy Team Draft (Game {activeGameIndex + 1})
                    </span>
                    {(['TOP', 'JNG', 'MID', 'BOT', 'SUP'] as const).map((role) => (
                      <div key={`enemy-${role}`} className="flex items-center gap-2">
                        <span className="w-10 text-[10px] font-mono font-bold text-slate-400">{role}</span>
                        <select
                          value={currentGame.enemyDraft[role]}
                          onChange={(e) =>
                            updateCurrentGame('enemyDraft', {
                              ...currentGame.enemyDraft,
                              [role]: e.target.value,
                            })
                          }
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                        >
                          <option value="">Select Champion...</option>
                          {champions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveScrimBlock}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg text-sm transition mt-2"
              >
                {editingBlockId
                  ? `Update Scrim Block (${games.length} Games)`
                  : `Save Complete Scrim Block (${games.length} Games)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}