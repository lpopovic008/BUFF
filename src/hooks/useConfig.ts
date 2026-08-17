"use client";

import { useCallback, useEffect, useState } from "react";
import { AppConfig, getConfig } from "@/lib/localStore";

const EMPTY_CONFIG: AppConfig = {
  sleeperUsername: null,
  sleeperUserId: null,
  season: String(new Date().getFullYear()),
  leagues: [],
};

/** Loads AppConfig from localStorage after hydration (it doesn't exist during the static build/SSR pass). */
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
