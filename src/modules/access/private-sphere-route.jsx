import { Link, Navigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { canAccessPrivateSpheres } from "../shell/service-navigation.js";
import { useSphereSharing } from "./sphere-sharing.jsx";
import { APP_HOME } from "../shell/home-path.jsx";
import { useSession } from "../auth/session.jsx";
import { LoadingScreen } from "../shell/page-feedback.jsx";

export function PrivateSphereRoute({ children }) {
  const { user } = useSession();
  const access = useSphereSharing();
  if (access.loading) return <LoadingScreen compact />;
  if (access.active && access.error) {
    return (
      <div className="app-page sphere-access-error rollapp-body">
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LockKeyhole aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Нет доступа к разделу</EmptyTitle>
            <EmptyDescription>{access.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Link to={APP_HOME} className={buttonVariants()}>Вернуться в Rollapp</Link></EmptyContent>
        </Empty>
      </div>
    );
  }
  if (!canAccessPrivateSpheres(user) && !access.readOnly) return <Navigate to={APP_HOME} replace />;
  return children;
}
