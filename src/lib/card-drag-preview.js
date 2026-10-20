// A preview lives in body, outside the collection's contextual CSS. Snapshot
// computed styles so media aspect ratios, captions and group grids keep their
// visible geometry instead of reflowing when the clone leaves its page.
export function createCardDragPreview(source, className) {
  const preview = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [preview, ...preview.querySelectorAll('*')];
  originals.forEach((element, index) => {
    const copy = copies[index];
    const style = getComputedStyle(element);
    for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
    copy.style.setProperty('animation', 'none');
    copy.style.setProperty('transition', 'none');
    copy.removeAttribute('id');
    copy.removeAttribute('draggable');
    // Clones must never participate in drop hit-testing or source lookup.
    for (const attribute of [...copy.attributes]) {
      if (attribute.name.startsWith('data-')) copy.removeAttribute(attribute.name);
    }
  });
  const rect = source.getBoundingClientRect();
  preview.style.setProperty('box-sizing', 'border-box');
  preview.style.setProperty('width', `${rect.width}px`);
  preview.style.setProperty('height', `${rect.height}px`);
  preview.style.setProperty('--drag-width', `${rect.width}px`);
  Object.assign(preview.style, { position: 'fixed', pointerEvents: 'none', zIndex: className.includes('native-preview') ? '-1' : '120', left: className.includes('native-preview') ? '-10000px' : '0', top: className.includes('native-preview') ? '-10000px' : '0', transform: 'none' });
  preview.classList.remove('is-dragging', 'is-group-target', 'is-drop-target');
  preview.classList.add(...className.split(' '));
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  return preview;
}

// Escape can finish a gesture while its pointer is still down. Keep the click
// guard until that pointer is released; starting a timer at Escape is too early.
export function guardDragClick(suppress, pointerId) {
  let timer, disposed = false;
  suppress.current = true;
  const up = event => {
    if (event.pointerId !== pointerId) return;
    window.removeEventListener('pointerup', up, true);
    timer = setTimeout(() => { if (!disposed) suppress.current = false; }, 0);
  };
  window.addEventListener('pointerup', up, true);
  return () => { disposed = true; clearTimeout(timer); window.removeEventListener('pointerup', up, true); };
}
