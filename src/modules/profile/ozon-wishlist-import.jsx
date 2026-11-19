import { useState } from "react";
import { PageActionButton } from "@/components/page-action-button.jsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.jsx";
import { Input } from "@/components/ui/input.jsx";
import { ozonWishlistBookmark } from "../media-import/ozon-wishlist-clipboard.js";

const bookmarkTitle = "Скопировать список Ozon";

export function OzonWishlistImport({ disabled, importItems, status, busy }) {
  const [bookmarkStatus, setBookmarkStatus] = useState("");
  const bookmark = ozonWishlistBookmark();

  async function copyBookmarkAddress() {
    try {
      await navigator.clipboard.writeText(bookmark);
      setBookmarkStatus("Адрес скопирован. Создайте закладку и вставьте его в её поле URL.");
    } catch {
      setBookmarkStatus("Перетащите название закладки на панель закладок браузера.");
    }
  }

  return <div className="grid min-w-0 gap-3">
    <p className="rollapp-body">Перетащите ссылку на панель закладок. После входа в Ozon откройте нужный список и нажмите закладку. Вернитесь сюда, чтобы добавить товары.</p>
    <a
      ref={(node) => node?.setAttribute("href", bookmark)}
      draggable
      className="rollapp-body w-fit max-w-full underline underline-offset-4"
      onClick={(event) => {
        event.preventDefault();
        void copyBookmarkAddress();
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/uri-list", bookmark);
        event.dataTransfer.setData("text/plain", bookmark);
        event.dataTransfer.effectAllowed = "copy";
      }}
      title="Перетащить на панель закладок или скопировать адрес"
    >{bookmarkTitle}</a>
    <p role="status" className={bookmarkStatus ? "text-xs text-muted-foreground" : "sr-only"}>{bookmarkStatus}</p>
    <PageActionButton type="button" variant="outline" disabled={disabled} aria-busy={busy || undefined}
      aria-label="Импортировать из буфера"
      className="w-fit max-w-full whitespace-normal text-center"
      onClick={() => importItems(async () => {
        try {
          return { text: await navigator.clipboard.readText() };
        } catch {
          throw new Error("Вставьте скопированный список в поле ниже.");
        }
      })}
    >Импорт из буфера</PageActionButton>
    <Field className="min-w-0">
      <FieldLabel htmlFor="ozon-wishlist-paste">Вставить и импортировать</FieldLabel>
      <Input id="ozon-wishlist-paste" disabled={disabled} placeholder="Вставьте скопированный список"
        aria-describedby="ozon-wishlist-paste-help"
        onPaste={(event) => {
          event.preventDefault();
          if (disabled) return;
          const text = event.clipboardData.getData("text/plain");
          const html = event.clipboardData.getData("text/html");
          importItems(() => ({ text, html }));
        }} />
      <FieldDescription id="ozon-wishlist-paste-help">Можно выделить и скопировать сами карточки в открытом списке Ozon, затем вставить их в это поле.</FieldDescription>
    </Field>
    <p role="status" className={status ? "text-xs text-muted-foreground" : "sr-only"}>{status}</p>
  </div>;
}
