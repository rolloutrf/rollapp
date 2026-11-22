import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PageActionButton } from "@/components/page-action-button";
import { BusinessPersonalOffers } from "@/components/personal-offers";
import { useSession } from "../auth/session.jsx";
import { api } from "../runtime/api.js";
import { APP_HOME } from "../shell/home-path.jsx";
import { SERVICE_SWITCHER_ITEMS } from "../shell/service-menu.jsx";
import { profileCardAccent } from "../profile/profile-card-accent.js";
import { SPHERE_SECTION_LABELS, sphereSectionPath } from "../../../shared/modules/access/sphere-sharing.js";
import { businessCategoryFor } from "../../../shared/modules/catalog-marketplace/business-accounts.js";
import { publicSpacePath } from "../../../shared/modules/profile/profile-links.js";

const businessSphereLabel = (sphere) => SERVICE_SWITCHER_ITEMS.find((item) => item.id === sphere)?.label || sphere;
const businessSectionLabel = (section) => SPHERE_SECTION_LABELS[section] || section;

export function BusinessAccessPage({ embedded = false }) {
  const { user } = useSession();
  if (user?.accountType !== "business") return <Navigate to={APP_HOME} replace />;
  return <BusinessClients key={user.id} user={user} embedded={embedded} />;
}

function BusinessClients({ user, embedded }) {
  const category = businessCategoryFor(user);
  const [state, setState] = useState({ shares: [], error: null, loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api.get("/sphere-shares/incoming").then(({ shares = [] }) => {
      if (active) setState({ shares, error: null, loading: false });
    }).catch(error => {
      if (active) setState({ shares: [], error, loading: false });
    });
    return () => { active = false; };
  }, [revision]);
  const { shares, error, loading } = state;

  return <div className={`${embedded ? "" : "app-page "}business-access-page page-stack page-stack--sections rollapp-body`}>
    <header className="business-access-page__header typeset typeset-rollapp">
      {embedded ? <h2>Клиенты</h2> : <h1>Клиенты</h1>}
      {category && <p>{category.label} · {category.sphereLabel}</p>}
      {!embedded && category?.id === "seller" && <PageActionButton to={publicSpacePath(user, user.sellerSpace || "products")}>Моя страница</PageActionButton>}
    </header>
    {category?.id !== "seller" && <BusinessPersonalOffers user={user} />}
    {loading && <p className="business-access-page__status" role="status"><Spinner />Загружаем ранее открытые разделы…</p>}
    {error && <Alert variant="destructive">
      <AlertTitle>Не удалось загрузить ранее открытые разделы</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <PageActionButton type="button" variant="outline" onClick={() => {
        setState({ shares: [], error: null, loading: true });
        setRevision(value => value + 1);
      }}>Повторить</PageActionButton>
    </Alert>}
    {shares.length > 0 && <section className="business-access-page__section" aria-labelledby="business-shares-title">
      <header className="typeset typeset-rollapp"><h2 id="business-shares-title">Ранее открытые разделы</h2></header>
      <ul className="contacts-grid" role="list" aria-label="Ранее открытые разделы">
        {shares.map(({ owner, sphere, section }) => (
          <BusinessAccessCard key={JSON.stringify([owner.id, sphere, section])} owner={owner} scope={{ sphere, section }} actions={
            <Link to={sphereSectionPath({ owner, sphere, section })} data-slot="button" className={buttonVariants({ variant: "outline" })}
              aria-label={`Открыть «${businessSectionLabel(section)}» — ${owner.name}`}>Открыть</Link>
          } />
        ))}
      </ul>
    </section>}
  </div>;
}

function BusinessAccessCard({ owner, scope, actions }) {
  return (
    <li className="business-access-card" style={{ "--contact-accent": profileCardAccent(owner.username || owner.name) }}>
      <div className="business-access-card__body">
        <div className="contact-card__avatar-wrap">
          <Avatar user={owner} size="lg" className="contact-card__avatar" aria-hidden="true" />
        </div>
        <div className="business-access-card__identity">
          <strong>{owner.name}</strong>
          <span className="text-xs text-muted-foreground wrap-anywhere">@{owner.username}</span>
        </div>
        <div className="business-access-card__scope">
          <span><Building2 aria-hidden="true" /><span>{businessSectionLabel(scope.section)}</span></span>
          {scope.section !== scope.sphere && <span className="business-access-card__caption">{businessSphereLabel(scope.sphere)}</span>}
        </div>
      </div>
      <footer className="business-access-card__footer">{actions}</footer>
    </li>
  );
}
