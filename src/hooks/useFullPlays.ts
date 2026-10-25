"use client";

import { useSyncExternalStore } from "react";
import { getConfig, onLocalWrite } from "@/lib/localStore";

/** Whether the Red Zone shows plays in full (see AppConfig.fullPlays) — simple unless it's been switched. Follows the setting as it changes. */
export function useFullPlays(): boolean {
  return useSyncExternalStore(onLocalWrite, () => getConfig().fullPlays === true, () => false);
}
