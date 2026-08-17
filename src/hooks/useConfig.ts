"use client";

import { useCallback, useEffect, useState } from "react";
import { AppConfig, getConfig } from "@/lib/localStore";
import { DEFAULT_SLEEPER_USERNAME, defaultSeason } from "@/lib/app-defaults";
import { discoverAndSaveLeagues } from "@/lib/discover";

const EMPTY_CONFIG: AppConfig = {
  sleeperUsername: null,
  sleeperUserId: null,
  season: defaultSeason(),
  leagues: [],
};

/**
 * Loads AppConfig from localStorage after hydration (it doesn't exist during
 * the static build). If nothing is stored yet and a default username is baked
 * in, discovers that user's leagues automatically so a fresh browser needs no
 * trip through Settings.
 */
export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const refresh = useCallback(() => {
    setConfigState(getConfig());
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = getConfig();
      const needsBootstrap = !stored.sleeperUserId && DEFAULT_SLEEPER_USERNAME !== "";

      if (needsBootstrap) {
        setBootstrapping(true);
        try {
          const season = stored.season || defaultSeason();
          const discovered = await discoverAndSaveLeagues(DEFAULT_SLEEPER_USERNAME, season);
          if (!cancelled) {
            setConfigState(discovered);
            setLoaded(true);
            setBootstrapping(false);
          }
          return;
        } catch {
          // Sleeper unreachable or username wrong — fall back to whatever is
          // stored so the Settings page still offers a manual path.
          if (!cancelled) setBootstrapping(false);
        }
      }

      if (!cancelled) {
        setConfigState(stored);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loaded, bootstrapping, refresh };
}
