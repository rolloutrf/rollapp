export async function refreshSession(load, setSession) {
  try {
    const result = await load();
    setSession({ ...result, loading: false, error: null });
    return result;
  } catch (error) {
    if (error.status === 401) {
      setSession({ user: null, loading: false, error: null });
      return { user: null };
    }
    // An unavailable server does not mean that the user's session expired.
    setSession((current) => ({ ...current, loading: false, error }));
    throw error;
  }
}
