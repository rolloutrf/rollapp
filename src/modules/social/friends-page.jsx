import { CircleUserRound, UserPlus, Users, LoaderCircle, MoreHorizontal, Search, Star, X } from "lucide-react";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../runtime/api.js";
import { Button as ShadcnButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { publicProfilePath } from "../../../shared/modules/profile/profile-links.js";
import { useAsync } from "../shell/use-async.jsx";
import { useToast } from "../shell/toast.jsx";
import { EmptyState, Button, LoadingScreen } from "../shell/page-feedback.jsx";

const friendSections = {
  subscriptions: {
    label: "Подписки",
    icon: Users,
    placeholder: "Поиск по подпискам",
    emptyTitle: "Подписок пока нет",
    emptyText: "Найдите близких и подпишитесь на их желания.",
  },
  followers: {
    label: "Подписчики",
    icon: CircleUserRound,
    placeholder: "Поиск по подписчикам",
    emptyTitle: "Подписчиков пока нет",
    emptyText: "Когда кто-то подпишется на вас, он появится здесь.",
  },
  search: {
    label: "Найти друзей",
    icon: UserPlus,
    placeholder: "Имя или @профиль",
    emptyTitle: "Никого не нашли",
    emptyText: "Попробуйте изменить имя или адрес профиля.",
    scope: "discover",
  },
};

export function FriendsPage() {
  const { section: requestedSection } = useParams();
  const navigate = useNavigate();
  const section = friendSections[requestedSection] ? requestedSection : null;
  const config = section ? friendSections[section] : null;
  const [search, setSearch] = useState("");
  const [busyPersonId, setBusyPersonId] = useState(null);
  const toast = useToast();
  const EmptyIcon = config?.icon || Users;
  const scope = config?.scope || section;
  const { data, loading, error, reload } = useAsync(
    () => api.get(`/people?scope=${encodeURIComponent(scope || "subscriptions")}&search=${encodeURIComponent(search)}`),
    [scope, search],
  );

  useEffect(() => {
    setSearch("");
  }, [section]);

  if (!section) return <Navigate to="/app/friends/subscriptions" replace />;

  const showSearch = section === "search" || Boolean(search) || Boolean(data?.people?.length);

  const toggleFollow = async (person) => {
    setBusyPersonId(person.id);
    try {
      const result = await api.post(`/profile/${person.username}/follow`, {});
      toast(result.following ? `Вы подписались на ${person.name}` : `Вы отписались от ${person.name}`);
      await reload();
    } catch (followError) {
      toast(followError.message, "error");
    } finally {
      setBusyPersonId(null);
    }
  };

  return (
    <div className="app-page friends-page typeset typeset-rollapp">
      <div className="friends-layout not-typeset">
        <section className="friends-directory page-stack" aria-label={config.label}>
          <ToggleGroup
            className="friends-section-nav w-full flex-wrap gap-1 rounded-xl border bg-card p-1"
            aria-label="Разделы друзей"
            value={[section]}
            onValueChange={([nextSection]) => {
              if (nextSection && nextSection !== section) navigate(`/app/friends/${nextSection}`);
            }}
          >
            {Object.entries(friendSections).map(([key, item]) => {
              const Icon = item.icon;
              return <ToggleGroupItem key={key} value={key} className="h-12 grow gap-2 px-3 hover:bg-muted/50 aria-pressed:hover:bg-muted">
                <Icon aria-hidden="true" />
                {item.label}
              </ToggleGroupItem>;
            })}
          </ToggleGroup>
          {showSearch && <InputGroup className="friends-search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
              className="h-full rounded-full py-0 font-semibold"
              type="search"
              aria-label={config.placeholder}
              placeholder={config.placeholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>}
          {loading ? <LoadingScreen compact /> : error ? (
            <div className="friends-empty" role="alert">
              <strong>Не удалось загрузить людей</strong>
              <span>{error.message}</span>
              <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
            </div>
          ) : data.people.length ? (
            <ul className="friends-list">
              {data.people.map((person) => (
                <li className="friend-row" data-username={person.username} key={person.id}>
                  <Link className="friend-row__profile" to={publicProfilePath(person)}>
                    <Avatar user={person} size="md" aria-hidden="true" />
                    <span className="friend-row__identity">
                      <strong>{person.name}</strong>
                      <small>@{person.username} · {person.wishCount} {person.wishCount === 1 ? "желание" : "желаний"}</small>
                    </span>
                  </Link>
                  {person.isFollowing && person.isFollower && <span className="friend-row__mutual" title="Взаимная подписка" aria-label="Взаимная подписка"><Star fill="currentColor" /></span>}
                  <div className="friend-row__actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<ShadcnButton type="button" variant="ghost" size="icon" className="friend-row__more size-12 active:translate-y-0 max-[820px]:size-11" />}
                        aria-label={`Действия для ${person.name}`}
                      ><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent className="friend-row__menu static w-[210px]" align="end" sideOffset={8}>
                        <DropdownMenuItem className="min-h-12 gap-2 px-3" render={<Link to={publicProfilePath(person)} />}><CircleUserRound />Открыть профиль</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-12 gap-2 px-3" disabled={busyPersonId === person.id} onClick={() => toggleFollow(person)}>
                          {busyPersonId === person.id ? <LoaderCircle className="spin" /> : person.isFollowing ? <X /> : <UserPlus />}
                          {person.isFollowing ? "Отписаться" : "Подписаться"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={EmptyIcon} title={config.emptyTitle} text={config.emptyText} />
          )}
        </section>
      </div>
    </div>
  );
}
