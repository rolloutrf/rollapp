import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync(load, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestIdRef = useRef(0);
  const updateData = useCallback((updater) => {
    setState((current) => {
      if (current.data == null) return current;
      const data = typeof updater === "function" ? updater(current.data) : updater;
      return data === current.data ? current : { ...current, data };
    });
  }, []);
  const reload = useCallback(async ({ background = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, loading: background ? current.data == null : true, error: null }));
    try {
      const data = await load();
      if (requestId === requestIdRef.current) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState((current) => background && current.data != null
          ? { ...current, loading: false, error }
          : { data: null, loading: false, error });
      }
      throw error;
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload().catch(() => {});
    return () => { requestIdRef.current += 1; };
  }, [reload]);
  return { ...state, reload, updateData };
}
