import { useState } from "react";
import { ProfileSettingsModal } from "@/modules/profile/profile-settings.jsx";
import { PersistentProfileHero } from "@/modules/profile/profile-hero.jsx";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { Button } from "@/components/ui/button";
import { Example, Examples, Page, Scenario, owner, noop } from "../support.jsx";

export default { id: "rollapp-profile", title: "РОЛЛАПП/Модули/03 Профиль" };

const routes = {
  "GET /auth/yandex/config": { enabled: true },
  "GET /me": { user: owner },
  "GET /me/mood": { mood: null, history: [] },
  "GET /me/accounts": { accounts: [] },
  "GET /me/sessions": { accounts: [] },
  "GET /me/mcp/keys": { keys: [] },
  "GET /rolls": { balance: 750, transactions: [] },
  "PATCH /me": (_, values) => ({ user: { ...owner, ...values } }),
};
function Profile({ mood, owned, bio, settings }) {
  const [open, setOpen] = useState(settings);
  const user = { ...owner, publicMood: mood || null, bio };
  return <Scenario user={owned ? user : null} routes={{ ...routes, "GET /sphere-shares/context": { owner: user, isOwner: owned, people: [], requests: [] } }} access={owned ? undefined : { sphere: "wishlist", section: "products", readOnly: true }} path="/app/wishes"><Page>
    <PersistentProfileHero user={user} wishlistChrome />
    {owned && <Button className="self-center" onClick={() => setOpen(true)}>Настройки профиля</Button>}
    {open && <ProfileSettingsModal user={user} onClose={() => setOpen(false)} onSaved={noop} onMoodSaved={noop} onProfileUpdated={noop} />}
  </Page></Scenario>;
}

export const Owner = { name: "Шапка владельца", render: Profile, args: { mood: 4, owned: true, bio: owner.bio, settings: false } };
export const Visitor = { ...Owner, name: "Шапка для гостя", args: { ...Owner.args, owned: false } };
export const Settings = { ...Owner, name: "Настройки профиля", args: { ...Owner.args, settings: true } };
export const Avatars = { name: "Аватары и настроение", render: () => <Page title="Аватары профиля"><Examples>
  {[null, 1, 2, 3, 4, 5].map(level => <Example key={level ?? "none"} title={level ? `Настроение ${level}` : "Без настроения"}><Avatar user={owner} moodLevel={level} /></Example>)}
</Examples></Page> };
