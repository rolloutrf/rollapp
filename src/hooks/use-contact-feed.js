import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Keep the mounted cards while appending or refreshing. Only filter changes
// replace the feed; requests belonging to an older feed cannot commit.
export function useContactFeed(query, version) {
  const [state, setState] = useState({ data: null, loading: true, loadingMore: false, error: null });
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const feedKey = `${query}:${version}`;
  const activeKeyRef = useRef(feedKey);
  activeKeyRef.current = feedKey;
  const commit = useCallback((updater) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);
  const fetchPage = useCallback((page) => api.get(`/contacts?${query}&page=${page}`), [query]);
  const reload = useCallback(async ({ background = false } = {}) => {
    if (activeKeyRef.current !== feedKey) return;
    const request = ++requestRef.current;
    busyRef.current = true;
    const pages = background ? stateRef.current.data?.page || 1 : 1;
    commit((current) => ({ ...current, data: background ? current.data : null, loading: !background || !current.data, loadingMore: false, error: null }));
    try {
      let data;
      for (let page = 1; page <= pages; page += 1) {
        const result = await fetchPage(page);
        if (request !== requestRef.current || activeKeyRef.current !== feedKey) return;
        data = { ...result, contacts: [...(data?.contacts || []), ...result.contacts] };
        if (!result.hasMore) break;
      }
      commit(() => ({ data, loading: false, loadingMore: false, error: null }));
    } catch (error) {
      if (request === requestRef.current && activeKeyRef.current === feedKey) commit((current) => ({ ...current, loading: false, loadingMore: false, error }));
      throw error;
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [fetchPage, commit, feedKey]);
  useEffect(() => {
    void reload().catch(() => {});
    return () => { requestRef.current += 1; };
  }, [reload, version]);
  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (activeKeyRef.current !== feedKey || busyRef.current || current.loading || current.loadingMore || !current.data?.hasMore) return;
    const request = ++requestRef.current;
    busyRef.current = true;
    commit((value) => ({ ...value, loadingMore: true, error: null }));
    try {
      const result = await fetchPage(current.data.page + 1);
      if (request !== requestRef.current || activeKeyRef.current !== feedKey) return;
      commit((value) => {
        const ids = new Set(value.data.contacts.map((contact) => contact.id));
        return { data: { ...result, contacts: [...value.data.contacts, ...result.contacts.filter((contact) => !ids.has(contact.id))] }, loading: false, loadingMore: false, error: null };
      });
    } catch (error) {
      if (request === requestRef.current && activeKeyRef.current === feedKey) commit((value) => ({ ...value, loadingMore: false, error }));
    } finally {
      if (request === requestRef.current) busyRef.current = false;
    }
  }, [fetchPage, commit, feedKey]);
  const updateData = useCallback((updater) => {
    if (activeKeyRef.current !== feedKey) return;
    commit((current) => current.data ? { ...current, data: updater(current.data) } : current);
  }, [commit, feedKey]);
  return { ...state, reload, loadMore, updateData };
}
