export const maxWishParticipants = 20;

export function wishParticipantChanges(previous, next) {
  const previousIds = new Set(previous.map(({ id }) => id));
  const nextIds = new Set(next.map(({ id }) => id));
  return {
    add: [...nextIds].filter((id) => !previousIds.has(id)),
    remove: [...previousIds].filter((id) => !nextIds.has(id)),
  };
}
