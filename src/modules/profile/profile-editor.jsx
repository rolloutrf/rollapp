import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { renamedProfileLocation } from "../../../shared/modules/profile/profile-links.js";
import { useSession } from "../auth/session.jsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileSettingsModal } from "./profile-settings.jsx";

export const ProfileEditorContext = createContext(null);

export function useProfileEditor() { return useContext(ProfileEditorContext); }

export function ProfileEditorProvider({ children }) {
  const { user, setSession } = useSession();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [editor, setEditor] = useState(null);
  const [wishlistVersion, setWishlistVersion] = useState(0);
  const returnFocusRef = useRef(null);
  const openProfileEditor = useCallback((event) => {
    const trigger = event?.currentTarget;
    returnFocusRef.current = trigger instanceof HTMLElement ? trigger : null;
    const portrait = isMobile && returnFocusRef.current?.querySelector(".wishes-page__hero-avatar");
    setEditor({ portraitTop: portrait ? portrait.getBoundingClientRect().top : undefined });
  }, [isMobile]);
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    const result = params.get("diskSync");
    if (!["connected", "cancelled", "missing", "failed"].includes(result)) return;
    returnFocusRef.current = null;
    setEditor({ diskSyncCallback: result });
    params.delete("diskSync");
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
  }, [user, location, navigate]);
  const closeProfileEditor = useCallback(() => setEditor(null), []);
  const refreshWishlist = useCallback(() => setWishlistVersion(version => version + 1), []);
  const value = useMemo(() => ({ openProfileEditor, wishlistVersion, refreshWishlist }), [openProfileEditor, wishlistVersion, refreshWishlist]);
  return (
    <ProfileEditorContext.Provider value={value}>
      {children}
      {editor && user && <ProfileSettingsModal
        key={user.id}
        user={user}
        diskSyncCallback={editor.diskSyncCallback}
        openingPortraitTop={editor.portraitTop}
        finalFocus={returnFocusRef}
        onClose={closeProfileEditor}
        onMoodSaved={({ level, publicMood }) => setSession((current) => current.user?.id === user.id
          ? { ...current, user: { ...current.user, moodLevel: level, publicMood } }
          : current)}
        onProfileUpdated={(savedUser) => setSession({ user: savedUser, loading: false, error: null })}
        onWishlistsImported={refreshWishlist}
        onSaved={async (savedUser) => {
          const target = renamedProfileLocation(location, user, savedUser);
          setSession({ user: savedUser, loading: false, error: null });
          if (target !== `${location.pathname}${location.search}${location.hash}`) navigate(target, { replace: true, state: location.state });
          closeProfileEditor();
        }}
      />}
    </ProfileEditorContext.Provider>
  );
}
