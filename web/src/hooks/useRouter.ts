import { useState, useEffect, useCallback } from "react";
import { NavTab } from "../components/layout/Sidebar";
import { parseRoute, navigateTo, RouteState } from "../utils/router";

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute());

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute());
    };

    // If initial location has pathname like /settings and no hash, normalize to hash
    if (typeof window !== "undefined") {
      const current = parseRoute();
      const currentCleanHash = window.location.hash.replace(/^[#/]+/, "");
      if (!currentCleanHash && current.tab !== "dashboard") {
        navigateTo(current.tab, current.params, true);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  const navigate = useCallback(
    (tab: NavTab, params?: Record<string, string | number>, replace = false) => {
      navigateTo(tab, params, replace);
      setRoute(parseRoute());
    },
    [],
  );

  return {
    route,
    currentTab: route.tab,
    params: route.params,
    navigate,
  };
}
