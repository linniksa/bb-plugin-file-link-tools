import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Configuration } from "./actions";

export function useConfiguration() {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const version = ++request.current;
    try {
      const next = await rpc.call("configuration", {});
      if (version === request.current) { setConfig(next); setError(null); }
    } catch (cause) {
      if (version === request.current) { setConfig(null); setError(cause instanceof Error ? cause.message : String(cause)); }
    }
  }, [rpc]);
  useRealtime("configuration", () => { void reload(); });
  useEffect(() => { void reload(); return () => { request.current++; }; }, [reload, connection]);
  return { config, error, reload };
}
