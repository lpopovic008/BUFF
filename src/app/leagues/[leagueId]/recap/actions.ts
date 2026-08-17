"use server";

import { revalidatePath } from "next/cache";
import { saveRecap } from "@/lib/store";

export async function saveRecapAction(formData: FormData): Promise<void> {
  const leagueId = String(formData.get("leagueId"));
  const season = String(formData.get("season"));
  const week = Number(formData.get("week"));
  const title = String(formData.get("title"));
  const body = String(formData.get("body"));

  await saveRecap({ leagueId, season, week, title, body, savedAt: new Date().toISOString() });

  revalidatePath(`/leagues/${leagueId}/recap/${week}`);
  revalidatePath(`/leagues/${leagueId}/recaps`);
}
