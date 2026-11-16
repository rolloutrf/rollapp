import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WishlistSnippet } from "@/modules/card/wishlist-snippet.jsx";
import { WishDetailsModal } from "@/modules/card/wish-details.jsx";
import { Example, Examples, Page, Scenario, owner, noop } from "../support.jsx";

export default { id: "rollapp-card", title: "РОЛЛАПП/Модули/05 Карточка" };

const photo = "/store/cats/blue-tired.webp";
const wish = { id: "storybook-card", title: "Синий кот — Уставший", description: "Коллекционная фигурка. Эмалированная поверхность и матовая подставка.", space: "products", status: "active", price: 2400, currency: "RUB", imageUrl: photo, listIds: [] };

function Snippet({ title, price, image, badge }) {
  const [open, setOpen] = useState(false);
  return <Scenario><Page>
    <div className="w-full max-w-sm"><WishlistSnippet title={title} price={price} imageUrl={image ? photo : ""} mediaBadge={badge ? <Badge>{badge}</Badge> : null}
      openButton={{ "aria-label": `Открыть «${title}»`, onClick: () => setOpen(true) }} /></div>
    {open && <WishDetailsModal wish={{ ...wish, title }} owner profile={owner} onClose={() => setOpen(false)} onEdit={noop} onChanged={noop} />}
  </Page></Scenario>;
}

export const Interactive = { name: "Сниппет с открытием деталей", render: Snippet, args: { title: wish.title, price: "2 400 ₽", image: true, badge: "" } };
export const Matrix = { name: "Обложка, цена, бейдж, длинный заголовок", render: () => <Page><Examples>
  <Example title="С обложкой"><WishlistSnippet title={wish.title} price="2 400 ₽" imageUrl={photo} /></Example>
  <Example title="Без обложки и цены"><WishlistSnippet title="В подарок" /></Example>
  <Example title="Длинное название"><WishlistSnippet title="Синий коллекционный кот из серии фигурок для хранения за стеклом" price="12 499 ₸" imageUrl={photo} /></Example>
  <Example title="Медиа и статус"><WishlistSnippet title="Видеопревью" video imageUrl={photo} mediaBadge={<Badge>В резерве</Badge>} /></Example>
</Examples></Page> };
const Detail = ({ status, owned }) => <Scenario user={owned ? owner : null}><WishDetailsModal wish={{ ...wish, status }} screen owner={owned} profile={owner} onClose={noop} onEdit={noop} onChanged={noop} /></Scenario>;
export const OwnerDetails = { name: "Детали владельца", render: Detail, args: { status: "active", owned: true } };
export const GuestDetails = { name: "Детали для гостя", render: Detail, args: { status: "active", owned: false } };
export const Fulfilled = { name: "Исполненное желание", render: Detail, args: { status: "fulfilled", owned: true } };
