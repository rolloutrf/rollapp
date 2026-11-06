import { Link } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });

function noteDate(note) {
  return new Date(note.updatedAt || note.createdAt);
}

function updatedLabel(note) {
  const date = noteDate(note);
  return Number.isNaN(date.getTime()) ? "Заметка" : `Изменено ${dateFormat.format(date)}`;
}

function TileContent({ icon: Icon, title, caption }) {
  return <>
    <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
    <span className="notes-tile__label">
      <span className="notes-tile__title text-rollapp-body font-medium" title={title}>{title}</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </span>
  </>;
}

export function NotesLibrary({ notes, loading, error, creating, onCreate, errorContent }) {
  const sortedNotes = [...notes].sort(
    (a, b) => (noteDate(b).getTime() || 0) - (noteDate(a).getTime() || 0) || a.title.localeCompare(b.title, "ru"),
  );
  const createDisabled = creating || loading || Boolean(error);
  return <>
    {errorContent}
    {loading && <p role="status" className="sr-only">Загружаем заметки…</p>}
    {creating && <p role="status" className="sr-only">Создаём заметку…</p>}
    <div className="notes-grid">
      <Button
        type="button"
        variant="outline"
        className="notes-tile notes-tile--blank"
        aria-label="Создать заметку"
        disabled={createDisabled}
        onClick={onCreate}
      >
        <TileContent icon={Plus} title="Пустой документ" caption="С чистого листа" />
      </Button>
      {loading ? [0, 1, 2].map(index => <Skeleton key={index} className="notes-grid__skeleton" aria-hidden="true" />) : !error && sortedNotes.map(note => <Link
        key={note.id}
        className={cn(buttonVariants({ variant: "outline" }), "notes-tile")}
        aria-label={note.title}
        to={`?tab=notes&note=${encodeURIComponent(note.id)}`}
      >
        <TileContent icon={FileText} title={note.title} caption={updatedLabel(note)} />
      </Link>)}
    </div>
  </>;
}
