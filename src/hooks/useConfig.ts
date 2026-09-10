"use client";

import { useCallback, useEffect, useState } from "react";
import { AppConfig, getConfig } from "@/lib/localStore";
import { defaultSeason } from "@/lib/app-defaults";

const EMPTY_CONFIG: AppConfig = {
  sleeperUsername: null,
  sleeperUserId: null,
  season: defaultSeason(),
  leagues: [],
  externalLeagues: [],
  googleClientId: null,
};

/** Loads AppConfig from localStorage after hydration (it doesn't exist during the static build) — blank on a fresh browser until the commish sets a username in Settings. */
export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    setConfigState(getConfig());
    setLoaded(true);
  }, []);

  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);

  return { config, loaded, refresh };
}
