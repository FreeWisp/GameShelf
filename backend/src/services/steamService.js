import { config } from '../config.js';

// Thin wrapper around the five Steam Web API endpoints required by spec 3.1.
// All calls go through the load-leveling queue (see queue handlers), so this
// module just performs the raw HTTP request and shapes the response.

const KEY = config.steam.apiKey;
const BASE = config.steam.base;

async function steamGet(path, params = {}) {
  const qs = new URLSearchParams({ key: KEY, format: 'json', ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`Steam ${path} error ${res.status}`);
  return res.json();
}

export const steamService = {
  // 3.1.1
  async getFriendList(steamid) {
    const data = await steamGet('ISteamUser/GetFriendList/v0001/', {
      steamid, relationship: 'friend',
    });
    return data?.friendslist?.friends ?? [];
  },

  // 3.1.2
  async getUserStatsForGame(steamid, appid) {
    const data = await steamGet('ISteamUserStats/GetUserStatsForGame/v0002/', { steamid, appid });
    return data?.playerstats ?? null;
  },

  // Player summary — communityvisibilitystate: 3 = public, 1/2 = private/friends.
  async getPlayerSummary(steamid) {
    const data = await steamGet('ISteamUser/GetPlayerSummaries/v0002/', { steamids: steamid });
    return data?.response?.players?.[0] ?? null;
  },

  // 3.1.3 — `accessible` distinguishes private "game details" (empty response,
  // no game_count at all) from a genuinely empty-but-public library.
  async getOwnedGames(steamid) {
    const data = await steamGet('IPlayerService/GetOwnedGames/v0001/', {
      steamid, include_appinfo: 1, include_played_free_games: 1,
    });
    return {
      games: data?.response?.games ?? [],
      accessible: data?.response?.game_count !== undefined,
    };
  },

  // 3.1.4
  async getRecentlyPlayedGames(steamid) {
    const data = await steamGet('IPlayerService/GetRecentlyPlayedGames/v0001/', { steamid });
    return data?.response?.games ?? [];
  },

  // 3.1.5
  async getNewsForApp(appid, count = 3, maxlength = 300) {
    const data = await steamGet('ISteamNews/GetNewsForApp/v0002/', { appid, count, maxlength });
    return data?.appnews?.newsitems ?? [];
  },

  // Achievement schema (display names + icon URLs for locked/unlocked states).
  async getGameSchema(appid) {
    try {
      const data = await steamGet('ISteamUserStats/GetSchemaForGame/v2/', { appid, l: 'italian' });
      const list = data?.game?.availableGameStats?.achievements ?? [];
      const map = {};
      for (const a of list) {
        map[a.name] = { displayName: a.displayName, description: a.description, icon: a.icon, icongray: a.icongray };
      }
      return map;
    } catch {
      return {};
    }
  },

  // Player achievements merged with the schema, so each item carries its icon.
  async getPlayerAchievements(steamid, appid) {
    try {
      const [data, schema] = await Promise.all([
        steamGet('ISteamUserStats/GetPlayerAchievements/v0001/', { steamid, appid, l: 'italian' }),
        this.getGameSchema(appid),
      ]);
      const list = data?.playerstats?.achievements ?? [];
      const achievements = list.map((a) => ({
        apiname: a.apiname,
        achieved: a.achieved === 1,
        name: a.name ?? schema[a.apiname]?.displayName ?? a.apiname,
        icon: a.achieved === 1 ? schema[a.apiname]?.icon : schema[a.apiname]?.icongray,
      }));
      const unlocked = achievements.filter((a) => a.achieved).length;
      return { total: achievements.length, unlocked, achievements };
    } catch {
      return { total: 0, unlocked: 0, achievements: [] };
    }
  },
};
