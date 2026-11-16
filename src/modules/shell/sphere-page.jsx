import { lazy, Suspense } from "react";
import { sharePageUrl } from "../../applications/location.js";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { sphereSectionPath } from "../../../shared/modules/access/sphere-sharing.js";
import { APP_HOME } from "./home-path.jsx";
import { useToast } from "./toast.jsx";
import { SPHERE_SERVICES } from "./service-menu.jsx";
import { useGlobalShareHandler } from "./global-share.jsx";
import { LoadingScreen } from "./page-feedback.jsx";

const sphereSections = {
  identity: lazy(() => import("../../applications/identity/sections.jsx")),
  career: lazy(() => import("../../applications/career/sections.jsx")),
  education: lazy(() => import("../../applications/education/sections.jsx")),
  health: lazy(() => import("../../applications/health/sections.jsx")),
};

export function TabbedSpherePage({ sphereId, tabs }) {
  const sphere = SPHERE_SERVICES.find((item) => item.id === sphereId);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const access = useSphereSharing();
  const globalShareRef = useGlobalShareHandler();
  if (!sphere || !tabs?.length) return <Navigate to={APP_HOME} replace />;
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const legacyIdentityReportTab = sphereId === "identity" && ["gallup", "hogan"].includes(requestedTab);
  const activeTab = legacyIdentityReportTab ? "identity-reports" : tabs.some((tab) => tab.id === requestedTab) ? requestedTab : tabs[0].id;
  const activeTabConfig = tabs.find((tab) => tab.id === activeTab);
  const Section = sphereSections[sphereId];
  const selectTab = (tabId) => {
    const search = new URLSearchParams(location.search);
    search.set("tab", tabId);
    navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
  };
  globalShareRef.current = async () => {
    const path = sphereSectionPath({ owner: access.owner, sphere: sphereId, section: activeTab });
    try {
      await navigator.clipboard.writeText(sharePageUrl(path));
      toast(access.isOwner ? "Ссылка на раздел скопирована. Открыть её смогут выбранные люди." : "Ссылка на раздел скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  return (
    <div data-read-only={access.readOnly ? "true" : undefined} className={`app-page sphere-page sphere-page--tabbed typeset typeset-rollapp${activeTabConfig?.layout === "full-width" ? " sphere-page--full-width" : ""}`}>
      <div className="sphere-page__content tabbed-sphere">
        <Tabs value={activeTab} onValueChange={selectTab} className="sphere-tabs">
          <TabsContent key={activeTab} value={activeTab} className="sphere-tabs__content">
            <Suspense fallback={<LoadingScreen compact />}>
              <Section tab={activeTabConfig} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
