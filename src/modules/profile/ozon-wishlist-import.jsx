import { useState } from "react";
import { PageActionButton } from "@/components/page-action-button.jsx";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion.jsx";
import { Field, FieldLabel } from "@/components/ui/field.jsx";
import { Input } from "@/components/ui/input.jsx";
import { ozonWishlistBookmark } from "../media-import/ozon-wishlist-clipboard.js";

const bookmarkTitle = "Скопировать список Ozon";

async function readOzonClipboard() {
  const clipboard = navigator.clipboard;
  try {
    const items = await clipboard?.read?.().catch(() => null);
    if (items) {
      const item = items.find(({ types }) => types.includes("text/plain") || types.includes("text/html"));
      const read = async (type) => item?.types.includes(type) ? (await item.getType(type)).text() : "";
      const [text, html] = await Promise.all([read("text/plain"), read("text/html")]);
      return { text, html };
    }
    return { text: await clipboard.readText() };
  } catch {
    throw new Error("Вставьте карточки в поле «Скопированные карточки».");
  }
}

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

  return <div className="grid min-w-0 gap-4">
    <div className="typeset typeset-rollapp">
      <p id="ozon-wishlist-paste-help" className="text-muted-foreground">Откройте список в Ozon, выделите и скопируйте карточки товаров.</p>
    </div>
    <Field className="min-w-0">
      <FieldLabel htmlFor="ozon-wishlist-paste">Скопированные карточки</FieldLabel>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input id="ozon-wishlist-paste" disabled={disabled} placeholder="Вставьте карточки"
          className="min-w-0 flex-1 basis-44" aria-describedby="ozon-wishlist-paste-help"
          onPaste={(event) => {
            event.preventDefault();
            if (disabled) return;
            const text = event.clipboardData.getData("text/plain");
            const html = event.clipboardData.getData("text/html");
            importItems(() => ({ text, html }));
          }} />
        <PageActionButton type="button" variant="outline" disabled={disabled} aria-busy={busy || undefined}
          aria-label="Импортировать из буфера" className="max-w-full shrink-0 whitespace-normal text-center"
          onClick={() => importItems(readOzonClipboard)}
        >Из буфера</PageActionButton>
      </div>
      <p role="status" className={status ? "text-caption text-muted-foreground" : "sr-only"}>{status}</p>
    </Field>
    <Accordion className="min-w-0">
      <AccordionItem value="bookmark">
        <AccordionTrigger headerAs="h4" className="min-h-(--layout-control-size) items-center gap-2 text-rollapp-body! text-muted-foreground hover:no-underline">
          Закладка для копирования
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid min-w-0 gap-2">
            <div className="typeset typeset-rollapp">
              <p>Перетащите ссылку на панель закладок. Нажмите закладку в открытом списке Ozon, затем вернитесь сюда и нажмите «Из буфера».</p>
            </div>
            <a
              ref={(node) => node?.setAttribute("href", bookmark)}
              draggable
              className="rollapp-body w-fit max-w-full wrap-anywhere underline underline-offset-4"
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
            <p role="status" className={bookmarkStatus ? "text-caption text-muted-foreground" : "sr-only"}>{bookmarkStatus}</p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>;
}
