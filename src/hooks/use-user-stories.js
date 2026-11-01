import { useEffect, useState } from 'react';
import { api } from '@/api';

export function useUserStories(username) {
  const [stories, setStories] = useState([]);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    setStories([]); setLoadError('');
    if (!username) return;
    let active = true;
    let request = 0;
    const refresh = async () => {
      const id = ++request;
      try {
        const result = await api.get(`/stories/users/${encodeURIComponent(username)}`);
        if (active && id === request) { setStories(result.stories.filter(item => Date.parse(item.expiresAt) > Date.now())); setLoadError(''); }
      } catch (error) { if (active && id === request) setLoadError(error.message); }
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    const expire = setInterval(() => setStories(items => {
      const next = items.filter(item => Date.parse(item.expiresAt) > Date.now());
      return next.length === items.length ? items : next;
    }), 1000);
    window.addEventListener('rollapp:stories', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(interval); clearInterval(expire); window.removeEventListener('rollapp:stories', refresh); window.removeEventListener('focus', refresh); };
  }, [username]);
  return { stories, loadError };
}
