"use client";

import { useEffect, useRef, useState } from "react";
import { useMiniApp } from "./provider";
import { miniGet } from "./api";

export function useMiniGet<T>(path: string | null) {
  const { initData, status } = useMiniApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  useEffect(() => {
    if (status !== "ready" || !path || !initData) return;
    let cancelled = false;
    const first = dataRef.current === null;
    if (first) setLoading(true);
    setError(null);
    void miniGet<T>(path, initData)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initData, path, status]);

  const reload = async (opts?: { silent?: boolean }) => {
    if (!path || !initData) return;
    if (!opts?.silent && dataRef.current === null) {
      setLoading(true);
      setError(null);
    }
    try {
      setData(await miniGet<T>(path, initData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  return { data, error, loading, reload, setData };
}
