"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

type AdminSettingKey = "homepage-slides" | "store-pages" | "store-navigation" | "delivery-zones" | "store-payments" | "store-settings" | "store-seo-social" | "notification-settings" | "integration-settings" | "store-localization";
type SettingResult = Awaited<ReturnType<typeof client.getAdminSetting>>;

/** Query-backed autosave state for the Storefront and Settings workspaces. */
export function useAdminSetting<T>(key: AdminSettingKey, initial: T, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-settings", key];
  const query = useQuery({ queryKey, queryFn: () => client.getAdminSetting({ key }), enabled, staleTime: 20_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const valueRef = useRef(value);
  const revisionRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const generationRef = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!query.isSuccess || dirtyRef.current) return;
    const result = query.data as SettingResult;
    const next = result?.value === undefined || result?.value === null ? initial : result.value as T;
    valueRef.current = next;
    revisionRef.current = result?.revision ?? null;
    setValue(next);
    setReady(true);
  }, [initial, query.data, query.isSuccess]);

  const setAdminValue = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    const next = typeof action === "function" ? (action as (previous: T) => T)(valueRef.current) : action;
    valueRef.current = next;
    dirtyRef.current = true;
    generationRef.current += 1;
    setSaveError(null);
    setValue(next);
  }, []);

  const saveLatest = useCallback((): Promise<boolean> => {
    if (!dirtyRef.current) return Promise.resolve(true);
    const task = saveQueue.current.then(async () => {
      if (!dirtyRef.current) return true;
      const generation = generationRef.current;
      try {
        setIsSaving(true);
        const saved = await client.saveAdminSetting({ key, value: valueRef.current, revision: revisionRef.current });
        revisionRef.current = saved.revision;
        if (generationRef.current === generation) dirtyRef.current = false;
        setSaveError(null);
        queryClient.setQueryData(queryKey, saved);
        return generationRef.current === generation;
      } catch (error) {
        setSaveError(error);
        toast.error(error instanceof Error ? error.message : "Setting could not be saved.");
        if (error instanceof Error && error.message.includes("Another administrator changed")) {
          dirtyRef.current = false;
          const latest = await client.getAdminSetting({ key });
          revisionRef.current = latest?.revision ?? null;
          if (latest?.value !== undefined && latest.value !== null) {
            valueRef.current = latest.value as T;
            setValue(latest.value as T);
          }
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    });
    saveQueue.current = task.then(() => undefined, () => undefined);
    return task;
  }, [key, queryClient, queryKey]);

  const saveNow = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!ready) return Promise.resolve(false);
    return saveLatest();
  }, [ready, saveLatest]);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      timerRef.current = null;
      void saveLatest();
    }, 450);
    timerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [ready, saveLatest, value]);

  return [value, setAdminValue, ready, { isLoading: query.isLoading && !ready, isError: query.isError && !ready, isSaving: isSaving || dirtyRef.current, error: query.error ?? saveError, refetch: query.refetch, saveNow }] as const;
}

export function AdminSettingsLoadState({ loading, error, retry, label }: { loading: boolean; error: boolean; retry: () => unknown; label: string }) {
  if (!loading && !error) return null;
  return <section className="catalogue-load-state" role={error ? "alert" : "status"} aria-live="polite"><div className="catalogue-load-state__mark">{error ? "!" : <span />}</div><div><strong>{error ? `Could not load ${label}` : `Loading ${label}`}</strong><p>{error ? "Saved changes remain safe. Check your connection and retry." : "Loading the saved store configuration…"}</p></div>{error && <button className="admin-secondary-button" type="button" onClick={() => void retry()}>Try again</button>}</section>;
}
