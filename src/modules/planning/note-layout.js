export function buildNoteLibrary(notes, layout) {
  const lastEdit = note => Date.parse(note.updatedAt || note.createdAt) || 0;
  const sortedNotes = [...notes].sort((a, b) => lastEdit(b) - lastEdit(a) || a.title.localeCompare(b.title, "ru"));
  const notesById = new Map(sortedNotes.map(note => [note.id, note]));
  const groups = layout.groups.flatMap(group => {
    const noteIds = group.noteIds.filter(id => notesById.has(id));
    return noteIds.length ? [{ ...group, noteIds }] : [];
  });
  const grouped = new Set(groups.flatMap(group => group.noteIds));
  const items = new Map([
    ...sortedNotes.filter(note => !grouped.has(note.id)).map(note => [note.id, note]),
    ...groups.map(group => [group.id, group]),
  ]);
  // New notes appear before the saved sequence, in their usual date order.
  const saved = new Set(layout.order);
  const order = [...[...items.keys()].filter(id => !saved.has(id)), ...layout.order.filter(id => items.has(id))];
  return { layout: { ...layout, groups, order }, items: order.map(id => items.get(id)), notesById };
}

export function createNoteGroup(layout, group, noteIds) {
  const members = new Set(noteIds);
  return {
    ...layout,
    groups: [...layout.groups, { ...group, noteIds }],
    order: layout.order.flatMap(id => id === noteIds[0] ? [group.id] : members.has(id) ? [] : [id]),
  };
}

export function addNoteToGroup(layout, noteId, groupId) {
  return {
    ...layout,
    groups: layout.groups.map(group => group.id === groupId ? { ...group, noteIds: [...group.noteIds, noteId] } : group),
    order: layout.order.filter(id => id !== noteId),
  };
}

export function removeNotesFromGroup(layout, group, noteIds) {
  const removed = new Set(noteIds);
  const remaining = group.noteIds.filter(id => !removed.has(id));
  return {
    ...layout,
    groups: remaining.length
      ? layout.groups.map(current => current.id === group.id ? { ...group, noteIds: remaining } : current)
      : layout.groups.filter(current => current.id !== group.id),
    order: layout.order.flatMap(id => id === group.id ? [...(remaining.length ? [group.id] : []), ...noteIds] : [id]),
  };
}
