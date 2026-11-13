import { definePrimitive } from '@ui-sdk/core';
import { createAgent } from '@ui-sdk/react/agent';
import { createParts } from '@ui-sdk/react/primitive';
import { ArrowRight, ListChecks } from 'lucide-react';
import { useId, useLayoutEffect, useRef } from 'react';
import { wishCountNoun } from '../lib/list-navigation';
import { api } from '../api';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const sortPreview = definePrimitive({
  name: 'rollapp-wishlist-sort',
  options: { reviewKey: 'string', onPreview: 'callback' },
  state: options => ({ value: options.reviewKey }),
  api: context => ({ stageSuggestions: () => context.options().onPreview() }),
  slots: slot => ({ root: slot({}) }),
  agent: { actions: ['stageSuggestions'] },
});
const { Root: SortPreview } = createParts(sortPreview, { root: 'section' });
const previewAgent = createAgent({
  allow: ({ component, action }) => component === 'rollapp-wishlist-sort' && action === 'stageSuggestions',
});
const privacyLabel = { public: '', private: 'закрытый', followers: 'для подписчиков', link: 'по ссылке' };
const listLabel = ({ title, privacy }) => privacyLabel[privacy] ? `${title} · ${privacyLabel[privacy]}` : title;

export function AssistantWishlistSort({ value, review, onUpdate, onApplied }) {
  const reviewKey = useId();
  const confirming = useRef(false);
  const reviewHeading = useRef(null);
  const focusReview = useRef(false);
  const { rows, pending, moved, error } = review ?? {};
  useLayoutEffect(() => {
    if (!rows || !focusReview.current) return;
    focusReview.current = false;
    reviewHeading.current?.focus({ preventScroll: true });
  }, [rows]);
  const { items, lists, hasMore } = value;
  const choices = lists.map(list => ({ value: list.id, label: listLabel(list) }));
  const moves = items.flatMap(({ id }) => {
    const row = rows?.[id];
    return row?.checked && row.listId ? [{ wishId: id, listId: row.listId }] : [];
  });

  function stageSuggestions() {
    focusReview.current = true;
    onUpdate({
      rows: Object.fromEntries(items.map(({ id, listId }) => [id, { listId, checked: listId !== null }])),
      error: '',
    });
  }

  async function openPreview() {
    try {
      const entry = previewAgent.snapshot().find(item => item.component === 'rollapp-wishlist-sort' && item.value === reviewKey && !item.offPage);
      if (!entry) throw new Error();
      const result = await previewAgent.act({ steps: [{ ref: entry.ref, action: 'stageSuggestions' }] });
      if (!result.ok) throw new Error();
    } catch {
      onUpdate({ error: 'Не удалось открыть распределение. Попробуйте ещё раз.' });
    }
  }

  function updateRow(id, change) {
    onUpdate({ rows: { ...rows, [id]: { ...rows[id], ...change } }, error: '' });
  }

  async function apply(event) {
    event.preventDefault();
    if (!moves.length || pending || moved || confirming.current) return;
    confirming.current = true;
    onUpdate({ pending: true, error: '' });
    try {
      const result = await api.post('/messenger/assistant/wishlist-sort', { moves });
      if (result?.moved !== moves.length) throw new Error('Не удалось подтвердить перенос. Попробуйте ещё раз.');
      onUpdate({ moved: result.moved, pending: false });
      onApplied?.();
    } catch (error) {
      onUpdate({ pending: false, error: error.message });
    } finally {
      confirming.current = false;
    }
  }

  return <SortPreview aria-labelledby={reviewKey} reviewKey={reviewKey} onPreview={stageSuggestions} className="assistant-wishlist-sort">
    <header className="flex min-w-0 items-start gap-2">
      <ListChecks aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <h3 id={reviewKey} ref={reviewHeading} tabIndex={-1} className="font-semibold">Разбор желаний</h3>
        <p className="text-xs text-muted-foreground">{items.length} {wishCountNoun(items.length)}{hasMore ? ' в этой партии' : ''}</p>
      </div>
    </header>
    {!rows && <Button type="button" variant="outline" onClick={openPreview} className="h-auto min-h-12 min-w-0 max-w-full justify-self-start rounded-full px-6 py-2 text-start whitespace-normal">
      Проверить распределение
    </Button>}
    {rows && !moved && <form onSubmit={apply} className="grid min-w-0 gap-3">
      <ul className="grid min-w-0 gap-2" aria-label="Желания и списки">
        {items.map(({ id, title }) => {
          const { listId, checked } = rows[id];
          const labelId = `${reviewKey}-${id}`;
          return <li className="assistant-wishlist-sort__row" key={id}>
            <label className="assistant-wishlist-sort__label">
              <Checkbox aria-labelledby={labelId} checked={checked} disabled={pending || !listId}
                onCheckedChange={checked => updateRow(id, { checked })} />
              <span id={labelId}>{title}</span>
            </label>
            <Select items={choices} value={listId} disabled={pending} onValueChange={nextId => {
              if (nextId) updateRow(id, { listId: nextId, checked: checked || !listId });
            }}>
              <SelectTrigger aria-label={`Список для «${title}»`} className="w-full min-w-0" title={choices.find(choice => choice.value === listId)?.label}>
                <SelectValue placeholder="Выбрать список" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {choices.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </li>;
        })}
      </ul>
      <Button type="submit" disabled={pending || !moves.length} className="h-auto min-h-12 min-w-0 max-w-full justify-self-start rounded-full px-6 py-2 text-start whitespace-normal">
        <span>{pending ? 'Переносим…' : `Перенести выбранные${moves.length ? ` (${moves.length})` : ''}`}</span>
        <ArrowRight aria-hidden="true" />
      </Button>
    </form>}
    {moved > 0 && <p role="status">Перенесено {moved} {wishCountNoun(moved)}.</p>}
    {error && <p className="text-destructive" role="alert">{error}</p>}
  </SortPreview>;
}
