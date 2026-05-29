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

  // 3.1.3
  async getOwnedGames(steamid) {
    const data = await steamGet('IPlayerService/GetOwnedGames/v0001/', {
      steamid, include_appinfo: 1, include_played_free_games: 1,
    });
    return data?.response?.games ?? [];
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

  // Player achievements (used for the "Achievement (Steam API)" widget).
  async getPlayerAchievements(steamid, appid) {
    try {
      const data = await steamGet('ISteamUserStats/GetPlayerAchievements/v0001/', { steamid, appid, l: 'italian' });
      const list = data?.playerstats?.achievements ?? [];
      const unlocked = list.filter((a) => a.achieved === 1).length;
      return { total: list.length, unlocked, achievements: list };
    } catch {
      return { total: 0, unlocked: 0, achievements: [] };
    }
  },
};
