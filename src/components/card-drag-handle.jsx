import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Scrolling remains available on the card. Only this touch target owns a drag.
export function CardDragHandle({ title, disabled }) {
  return <Button type="button" variant="secondary" size="icon" className="education-card__drag-handle" data-card-drag-trigger data-card-drag-handle aria-label={`Перетащить «${title}»`} title="Перетащить карточку" disabled={disabled} onClick={event => { event.preventDefault(); event.stopPropagation(); }}><GripVertical aria-hidden="true" /></Button>;
}
