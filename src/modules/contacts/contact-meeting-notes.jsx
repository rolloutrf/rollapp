export function ContactMeetingNotes({ notes = [] }) {
  if (!notes.length) return null;
  return <section className="typeset typeset-rollapp typeset-document" aria-label="Заметки из To Do">
    <h3>Из встреч To Do</h3>
    {notes.map((note) => <section key={note.id}>
      <h4 className="break-words">{note.title}</h4>
      {note.dueOn && <p data-typography="caption" className="text-muted-foreground"><time dateTime={note.dueOn}>{note.dueOn.split("-").reverse().join(".")}{note.startTime ? ` · ${note.startTime}` : ""}</time></p>}
      <p className="whitespace-pre-wrap break-words">{note.description}</p>
    </section>)}
  </section>;
}
