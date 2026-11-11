import { useId, useLayoutEffect, useRef, useState } from "react";
import { FileUp, LockKeyhole, X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PURCHASE_HISTORY_MAX_CHARS, PURCHASE_HISTORY_MAX_ITEMS, parsePurchaseHistory } from "../../shared/purchase-history.js";
import { parsePurchaseHistoryFile } from "@/lib/purchase-history-file";
import { api } from "../api.js";

const BANK_HELP = "https://www.tbank.ru/bank/help/debit-cards/tinkoff-black/get-statement/reference/";
const formatAmount = (amount, currency) => new Intl.NumberFormat("ru-RU", currency ? { style: "currency", currency } : {}).format(amount);

export function PurchaseHistoryImport({ listId, listTitle, space, onClose, onSaved, returnFocusRef }) {
  const id = useId();
  const [source, setSource] = useState("bank");
  const [text, setText] = useState("");
  const [review, setReview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(null);
  const fileInput = useRef(null);
  const reviewTitle = useRef(null);
  const errorNotice = useRef(null);
  const isBank = source === "bank";
  const selected = review?.rows.filter((row) => row.checked) ?? [];
  const missingTitle = selected.some((row) => !row.title.trim());
  const exceedsLimit = selected.length > PURCHASE_HISTORY_MAX_ITEMS;
  const accept = isBank ? ".csv,.xlsx,.tsv,.pdf" : ".txt,.csv,.tsv,.json,.pdf";

  const reviewing = Boolean(review);
  useLayoutEffect(() => {
    if (reviewing) reviewTitle.current?.focus();
  }, [reviewing]);

  useLayoutEffect(() => {
    if (error) errorNotice.current?.focus();
  }, [error]);

  function prepare(parsed, name = "") {
    if (!parsed.items.length) {
      setError(isBank
        ? "Покупки не найдены. Проверьте период или попробуйте выгрузку CSV или XLSX."
        : "Товары не найдены. Нужен чек или список с названиями и ценами позиций.");
      return;
    }
    setFileName(name);
    setReview({
      duplicates: parsed.duplicates,
      rows: parsed.items.map((item, index) => ({ ...item, id: index, checked: !isBank })),
    });
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
    busyRef.current = "read";
    setReading(true);
    setError("");
    try {
      prepare(await parsePurchaseHistoryFile(file, source), file.name);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReading(false);
      busyRef.current = null;
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setError("");
    if (!review) {
      if (!isBank && text.trim()) {
        try { prepare(parsePurchaseHistory(text)); }
        catch (failure) { setError(failure.message); }
      }
      return;
    }
    if (!selected.length || missingTitle || exceedsLimit) return;
    busyRef.current = "save";
    setSaving(true);
    let result;
    try {
      result = await api.post("/wishes/import-history", {
        listId, space,
        items: selected.map(({ title, price, currency }) => ({ title: title.trim(), price, currency })),
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      busyRef.current = null;
      setSaving(false);
    }
    if (result) onSaved(result);
  }

  function updateRow(rowId, patch) {
    setReview((current) => ({ ...current, rows: current.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row) }));
  }

  return (
    <Drawer open onOpenChange={(open, event) => {
      if (!open && busyRef.current === "save") event?.cancel?.();
      else if (!open) onClose();
    }}>
      <DrawerContent className="app-drawer--form rollapp-body" finalFocus={returnFocusRef} aria-labelledby={`${id}-title`}>
        <DrawerClose render={<Button className="absolute top-2 right-2 z-10" variant="outline" size="icon" type="button" disabled={saving} />} aria-label="Закрыть импорт">
          <X aria-hidden="true" />
        </DrawerClose>
        <DrawerHeader className="md:pr-16">
          <DrawerTitle id={`${id}-title`} className="text-2xl">Импорт покупок</DrawerTitle>
          <DrawerDescription className="wrap-anywhere">В список «{listTitle}»</DrawerDescription>
        </DrawerHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Input ref={fileInput} type="file" accept={accept} hidden onChange={readFile} />
            {error && <p ref={errorNotice} tabIndex={-1} role="alert" className="wrap-anywhere text-destructive">{error}</p>}
            {!review ? <>
              <ToggleGroup value={[source]} disabled={reading} onValueChange={([next]) => {
                if (next && !busyRef.current) { setSource(next); setError(""); }
              }} aria-label="Источник покупок" className="flex w-full flex-wrap gap-2">
                <ToggleGroupItem value="bank">Выписка Т‑Банка</ToggleGroupItem>
                <ToggleGroupItem value="receipt">Заказы и чеки</ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-col items-start gap-2 rounded-xl border bg-muted/30 p-4">
                <p>{isBank
                  ? "В личном кабинете Т‑Банка откройте «Операции», выберите период и скачайте выгрузку."
                  : "Выберите чек или выгрузку с товарами. Можно также вставить текст."}</p>
                {isBank && <a href={BANK_HELP} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">Инструкция Т‑Банка</a>}
                {!isBank && <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={reading} onClick={() => fileInput.current?.click()}>
                  {reading ? <Spinner /> : <FileUp aria-hidden="true" />}
                  {reading ? "Читаем файл…" : "Выбрать файл"}
                </Button>}
                <p className="text-xs text-muted-foreground">{isBank ? "CSV, XLSX, TSV или текстовый PDF" : "TXT, CSV, TSV, JSON или текстовый PDF"} · до 5 МБ</p>
              </div>
              {!isBank && <Field>
                <FieldLabel htmlFor={`${id}-text`}>Текст чека или заказа</FieldLabel>
                <Textarea id={`${id}-text`} rows={5} className="resize-y" disabled={reading} value={text} maxLength={PURCHASE_HISTORY_MAX_CHARS}
                  onChange={(event) => { setText(event.target.value); setError(""); }}
                  placeholder={"Например:\nЧай зелёный — 249 ₽\nШоколад — 159 ₽"} />
              </Field>}
              <p className="flex items-start gap-2 text-muted-foreground">
                <LockKeyhole className="mt-1 size-5 shrink-0" aria-hidden="true" />
                Файл разбирается на вашем устройстве. Сохраняются только выбранные карточки.
              </p>
            </> : <>
              <div className="flex flex-col gap-2">
                <h2 tabIndex={-1} ref={reviewTitle} className="text-xl font-semibold outline-none">{isBank ? "Покупки из выписки" : "Найденные товары"}: {review.rows.length}</h2>
                {fileName && <p className="text-xs wrap-anywhere text-muted-foreground">{fileName}</p>}
                <p>{isBank
                  ? "Отметьте нужные покупки и впишите названия товаров. Одна операция может включать несколько товаров — для точного состава используйте чек."
                  : "Проверьте названия и снимите отметки с лишних товаров."}</p>
                {review.duplicates > 0 && <p className="text-xs text-muted-foreground">Повторы в файле: {review.duplicates}</p>}
                <Button type="button" variant="outline" className="min-h-12 self-start rounded-full" disabled={saving} onClick={() => { setReview(null); setError(""); }}>Изменить источник</Button>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={isBank ? "Покупки" : "Товары"}>
                {review.rows.map((row) => {
                  const controlId = `${id}-item-${row.id}`;
                  const operation = row.operation;
                  return (
                    <li key={row.id} className="flex min-w-0 flex-col gap-2 rounded-xl border p-3">
                      <div className="flex min-h-12 min-w-0 items-center gap-3">
                        <Checkbox id={controlId} checked={row.checked} disabled={saving} onCheckedChange={(checked) => updateRow(row.id, { checked })} />
                        <label className="flex min-w-0 flex-1 cursor-pointer flex-col wrap-anywhere" htmlFor={controlId}>
                          <span>{operation ? operation.description || row.title : row.title || "Товар без названия"}</span>
                          {operation ? <span className="text-xs text-muted-foreground">{operation.date} · {formatAmount(operation.amount, operation.currency)}</span>
                            : row.price !== null && <span className="text-xs text-muted-foreground">{formatAmount(row.price, row.currency)}</span>}
                        </label>
                      </div>
                      {row.checked && <Field className="gap-1">
                        <FieldLabel htmlFor={`${controlId}-title`}>Название товара <span className="sr-only">{row.id + 1}</span></FieldLabel>
                        <Input id={`${controlId}-title`} maxLength={160} value={row.title} disabled={saving} onChange={(event) => updateRow(row.id, { title: event.target.value })} />
                      </Field>}
                    </li>
                  );
                })}
              </ul>
              <p className="text-muted-foreground" role="status">{exceedsLimit
                ? `За один раз можно создать не больше ${PURCHASE_HISTORY_MAX_ITEMS} карточек.`
                : missingTitle ? "Заполните названия отмеченных товаров." : `Выбрано: ${selected.length}. Карточки будут видны только вам.`}</p>
            </>}
          </div>
          <DrawerFooter>
            {review || !isBank ? <Button type="submit" disabled={reading || saving || (review ? !selected.length || missingTitle || exceedsLimit : !text.trim())} aria-busy={saving || undefined}>
              {saving && <Spinner />}
              {review ? `Создать карточки${selected.length ? ` · ${selected.length}` : ""}` : "Найти товары"}
            </Button> : <Button type="button" disabled={reading} onClick={() => fileInput.current?.click()}>
              {reading ? <Spinner /> : <FileUp aria-hidden="true" />}{reading ? "Читаем файл…" : "Выбрать файл"}
            </Button>}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
