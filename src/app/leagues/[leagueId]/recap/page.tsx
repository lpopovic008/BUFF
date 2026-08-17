import { redirect } from "next/navigation";
import { getNFLState } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

export default async function RecapRedirectPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const state = await getNFLState();
  const week = state?.week && state.week >= 1 ? state.week : 1;
  redirect(`/leagues/${leagueId}/recap/${week}`);
}
