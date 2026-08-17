"use server";

import { revalidatePath } from "next/cache";
import { getUserByUsername, getUserLeagues, getLeagueUsers } from "@/lib/sleeper";
import { getConfig, saveConfig, removeLeague as removeLeagueFromStore, TrackedLeague } from "@/lib/store";

export async function discoverLeagues(formData: FormData): Promise<{ error?: string }> {
  const username = String(formData.get("username") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();
  if (!username || !season) return { error: "Username and season are required." };

  let discovered: TrackedLeague[];
  let userId: string;
  try {
    const user = await getUserByUsername(username);
    if (!user) return { error: `No Sleeper user found for "${username}".` };
    userId = user.user_id;

    const leagues = await getUserLeagues(user.user_id, season);
    const config = await getConfig();
    const existingById = new Map(config.leagues.map((l) => [l.leagueId, l]));
    discovered = [];
    for (const league of leagues) {
      const existing = existingById.get(league.league_id);
      if (existing) {
        discovered.push(existing);
        continue;
      }
      const leagueUsers = await getLeagueUsers(league.league_id);
      const me = leagueUsers.find((u) => u.user_id === user.user_id);
      discovered.push({
        leagueId: league.league_id,
        nickname: league.name,
        isCommish: Boolean(me?.is_owner),
      });
    }
  } catch {
    return { error: "Couldn't reach Sleeper's API. Check your connection and try again." };
  }

  await saveConfig({
    sleeperUsername: username,
    sleeperUserId: userId,
    season,
    leagues: discovered,
  });

  revalidatePath("/settings");
  revalidatePath("/");
  return {};
}

export async function toggleCommish(formData: FormData): Promise<void> {
  const leagueId = String(formData.get("leagueId"));
  const config = await getConfig();
  const league = config.leagues.find((l) => l.leagueId === leagueId);
  if (league) {
    league.isCommish = !league.isCommish;
    await saveConfig(config);
  }
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function removeLeagueAction(formData: FormData): Promise<void> {
  const leagueId = String(formData.get("leagueId"));
  await removeLeagueFromStore(leagueId);
  revalidatePath("/settings");
  revalidatePath("/");
}
