import { useSearchParams } from "react-router-dom";
import { ControlBar } from "@/components/control-bar";
import { PersonalOffers } from "@/components/personal-offers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "../auth/session.jsx";
import { SPACES } from "../categories/wish-spaces.jsx";
import { WishlistBusinessListing, wishlistSpace } from "./wishlist-business.jsx";

export function WishlistOffersRoute() {
  const { user } = useSession();
  const [search, setSearch] = useSearchParams();
  const space = wishlistSpace(search);
  const label = SPACES.find((entry) => entry.id === space)?.label;
  const view = search.get("view") === "invoices" ? "invoices" : "offers";

  function changeView(next) {
    const params = new URLSearchParams(search);
    if (next === "invoices") params.set("view", next);
    else params.delete("view");
    setSearch(params);
  }

  return <section className="app-page app-page--collection rollapp-body" aria-label={`Предложения: ${label}`}>
    <Tabs value={view} onValueChange={changeView} className="page-stack gap-(--layout-page-gap)">
      <ControlBar className="flex justify-center">
        <TabsList aria-label="Предложения и счета" className="grid grid-flow-col auto-cols-max rounded-full p-0">
          <TabsTrigger value="offers" className="rounded-full px-4 after:hidden">Предложения</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-full px-4 after:hidden">Счета</TabsTrigger>
        </TabsList>
      </ControlBar>
      <TabsContent value="offers">
        {view === "offers" && <WishlistBusinessListing key={`${user.id}:${space}`} space={space} offers viewerId={user.id} />}
      </TabsContent>
      <TabsContent value="invoices">
        {view === "invoices" && <PersonalOffers key={user.id} user={user} />}
      </TabsContent>
    </Tabs>
  </section>;
}
