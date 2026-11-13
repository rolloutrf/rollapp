import { definePrimitive } from '@ui-sdk/core';
import { createAgent } from '@ui-sdk/react/agent';
import { createParts } from '@ui-sdk/react/primitive';
import { ArrowUpRight } from 'lucide-react';
import { useId, useState } from 'react';
import { PageActionButton } from './page-action-button';

const wishDraft = definePrimitive({
  name: 'rollapp-wish-draft',
  options: { draftKey: 'string', onReview: 'callback' },
  state: options => ({ value: options.draftKey }),
  api: context => ({ openDraft: () => context.options().onReview() }),
  slots: slot => ({ root: slot({}) }),
  agent: { actions: ['openDraft'] },
});
const { Root: WishDraft } = createParts(wishDraft, { root: 'div' });

export function AssistantWishAction({ value, onReview }) {
  const [agent] = useState(() => createAgent({
    allow: ({ component, action }) => component === 'rollapp-wish-draft' && action === 'openDraft',
  }));
  const draftKey = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const target = agent.snapshot().find(entry => entry.component === 'rollapp-wish-draft' && entry.value === draftKey && !entry.offPage);
      if (!target) throw new Error();
      const result = await agent.act({ steps: [{ ref: target.ref, action: 'openDraft' }] });
      if (!result.ok) throw new Error();
    } catch {
      setError('Не удалось открыть черновик. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  const title = value.title || 'Желание по ссылке';
  return <WishDraft role="group" aria-label={`Черновик желания: ${title}`} draftKey={draftKey} onReview={() => onReview(value)} className="messenger-assistant-action">
    <p><strong>{title}</strong></p>
    {value.url && <p>{new URL(value.url).hostname}</p>}
    {value.price !== null && <p>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: value.currency, maximumFractionDigits: 2 }).format(value.price)}</p>}
    {value.searchResult && value.price === null && <p>Цена требует проверки в магазине</p>}
    {value.listName && <p>Список «{value.listName}»</p>}
    <PageActionButton type="button" variant="outline" disabled={busy} onClick={review}>
      Проверить желание <ArrowUpRight aria-hidden="true" />
    </PageActionButton>
    {error && <p role="alert">{error}</p>}
  </WishDraft>;
}
