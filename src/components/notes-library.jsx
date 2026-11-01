import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownAZ, ArrowUpDown, ChevronDown, FileText, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageActionButton } from "@/components/page-action-button";
import { ControlBar } from "@/components/control-bar";

export const NOTE_TEMPLATES = [
  { id: "blank", title: "Пустой документ", description: "С чистого листа", content: "" },
  { id: "meeting", title: "Заметки встречи", description: "Обсудить и договориться", heading: "Встреча", sections: ["Повестка", "Обсуждение", "Следующие шаги"], content: "## Повестка\n\nЧто важно обсудить?\n\n## Обсуждение\n\nЗапишите основные мысли и решения.\n\n## Следующие шаги\n\n- [ ] Действие, ответственный и срок" },
  { id: "project", title: "План проекта", description: "От идеи к результату", heading: "Новый проект", sections: ["Цель", "Этапы работы", "Результат"], content: "## Цель\n\nКакую задачу решает проект?\n\n## Этапы работы\n\n- [ ] Первый этап\n- [ ] Второй этап\n- [ ] Третий этап\n\n## Результат\n\nКак понять, что проект завершён?" },
  { id: "ideas", title: "Мысли и идеи", description: "Сохранить важное", heading: "Есть идея", sections: ["Идея", "Почему это важно", "Первый шаг"], content: "## Идея\n\nО чём вы думаете?\n\n## Почему это важно\n\nЧто изменится, если это сделать?\n\n## Первый шаг\n\nС чего можно начать?" },
  { id: "journal", title: "Дневник", description: "Время для себя", heading: "Мой день", sections: ["Главное за день", "Что получилось", "За что я благодарен"], content: "## Главное за день\n\nЧто хочется запомнить?\n\n## Что получилось\n\nДаже небольшие достижения имеют значение.\n\n## За что я благодарен\n\nЗапишите три приятных момента." },
  { id: "reading", title: "Конспект", description: "Знания под рукой", heading: "Новые знания", sections: ["Источник", "Ключевые мысли", "На практике"], content: "## Источник\n\nНазвание книги, статьи или курса.\n\n## Ключевые мысли\n\n- Первая мысль\n- Вторая мысль\n\n## На практике\n\nКак применить эти знания?" },
  { id: "letter", title: "Письмо", description: "Слова по делу", heading: "Здравствуйте!", sections: ["Обращение", "Главная мысль", "Следующий шаг"], content: "Здравствуйте!\n\nНапишите, с чем вы обращаетесь.\n\nИзложите детали и предложите следующий шаг.\n\nС уважением," },
  { id: "weekly", title: "Итоги недели", description: "Заметить свой прогресс", heading: "Эта неделя", sections: ["Достижения", "Выводы", "Следующая неделя"], content: "## Достижения\n\nЧто удалось сделать?\n\n## Выводы\n\nЧему научила эта неделя?\n\n## Следующая неделя\n\n- [ ] Главное дело\n- [ ] Время для отдыха" },
];

const dateFormat = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
function updatedLabel(note) {
  const date = new Date(note.updatedAt || note.createdAt);
  return Number.isNaN(date.getTime()) ? "Заметка" : `Изменено ${dateFormat.format(date)}`;
}

function TemplatePreview({ template }) {
  return <Card className="notes-template__paper" aria-hidden="true">
    <CardContent className="notes-template__page">
      {template.id === "blank" ? <Plus className="notes-template__plus" /> : <>
        <span className="notes-template__eyebrow">{template.description}</span>
        <strong className="notes-template__heading">{template.heading}</strong>
        {template.sections.map(section => <div className="notes-template__section" key={section}><span>{section}</span><i /><i /><i /></div>)}
      </>}
    </CardContent>
  </Card>;
}

export function NotesLibrary({ notes, loading, error, creating, onCreate, errorContent }) {
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const matching = notes.filter(note => note.title.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const dateValue = note => { const value = new Date(sort === "created" ? note.createdAt : note.updatedAt || note.createdAt).getTime(); return Number.isNaN(value) ? 0 : value; };
  matching.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ru") : dateValue(b) - dateValue(a) || a.title.localeCompare(b.title, "ru"));
  return <>
    <header className="notes-library__header">
      <div className="typeset typeset-rollapp" data-typeset-group><h1>Заметки</h1><p className="text-muted-foreground">Место для мыслей, планов и новых идей.</p></div>
      <InputGroup className="notes-library__search">
        <InputGroupAddon><Search className="size-5" aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput aria-label="Поиск заметок" placeholder="Найти заметку" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" aria-label="Очистить поиск" onClick={() => setQuery("")}><X aria-hidden="true" /></Button></InputGroupAddon>}
      </InputGroup>
    </header>
    <section className="notes-library__templates" data-expanded={expanded || undefined} aria-labelledby="notes-templates-heading" aria-busy={creating}>
      <div className="notes-library__section-header">
        <h2 id="notes-templates-heading" className="text-xl font-medium">Создать документ</h2>
        <PageActionButton variant="ghost" aria-label="Галерея шаблонов" aria-expanded={expanded} aria-controls="notes-template-grid" onClick={() => setExpanded(value => !value)}><span className="hidden sm:inline">Галерея шаблонов</span><span className="sm:hidden">{expanded ? "Свернуть" : "Все шаблоны"}</span><ChevronDown className={expanded ? "rotate-180" : ""} aria-hidden="true" /></PageActionButton>
      </div>
      <div id="notes-template-grid" className={`notes-template-grid${mobile && !expanded ? " horizontal-tile-scroller" : ""}`}>
        {NOTE_TEMPLATES.slice(0, expanded ? undefined : 6).map(template => <div className="notes-template" key={template.id}>
          <Button variant="ghost" className="notes-template__button" disabled={creating || loading || Boolean(error)} onClick={() => onCreate(template)} aria-label={template.id === "blank" ? "Создать заметку" : `Создать заметку: ${template.title}`}>
            <TemplatePreview template={template} />
            <span className="notes-template__caption"><span className="notes-template__name">{template.title}</span><span className="notes-template__description">{template.description}</span></span>
          </Button>
        </div>)}
      </div>
      {creating && <p role="status" className="text-muted-foreground">Создаём документ…</p>}
    </section>
    <section className="notes-library__documents" aria-labelledby="notes-documents-heading">
      <div className="notes-library__section-header notes-library__document-toolbar">
        <h2 id="notes-documents-heading" className="text-xl font-medium">{query.trim() ? "Результаты поиска" : "Мои документы"}<span className="notes-library__count text-xs text-muted-foreground">{!loading && !error ? matching.length : ""}</span></h2>
        <div className="notes-library__tools">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Сортировка заметок" className="rounded-full"><ArrowUpDown aria-hidden="true" /><SelectValue>{sort === "title" ? "По названию" : sort === "created" ? "По дате создания" : "По дате изменения"}</SelectValue></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}><SelectItem value="updated">По дате изменения</SelectItem><SelectItem value="created">По дате создания</SelectItem><SelectItem value="title"><ArrowDownAZ aria-hidden="true" />По названию</SelectItem></SelectContent>
          </Select>
          <ControlBar className="notes-library__views" role="group" aria-label="Вид заметок">
            <Button data-control-icon variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} aria-label="Карточки" onClick={() => setView("grid")}><LayoutGrid aria-hidden="true" /></Button>
            <Button data-control-icon variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} aria-label="Список" onClick={() => setView("list")}><List aria-hidden="true" /></Button>
          </ControlBar>
        </div>
      </div>
      {errorContent}
      {loading ? <div className="notes-document-grid" role="status" aria-label="Загружаем заметки"><span className="sr-only">Загружаем заметки…</span>{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-72 rounded-xl" />)}</div> : !error && (matching.length ?
        <nav aria-label="Список заметок" className={view === "grid" ? "notes-document-grid" : "notes-document-list"}>
          {matching.map(note => <Link className="notes-document__link" aria-label={note.title} key={note.id} to={`?tab=notes&note=${encodeURIComponent(note.id)}`}>
            <Card className="notes-document">
              <CardContent className="notes-document__preview" aria-hidden="true"><div className="notes-document__sheet"><FileText className="size-5 text-muted-foreground" /><strong>{note.title}</strong><div className="notes-document__lines">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div></div></CardContent>
              <CardFooter className="notes-document__footer"><FileText className="notes-document__icon size-5 shrink-0" aria-hidden="true" /><div className="min-w-0"><span className="notes-document__title" title={note.title}>{note.title}</span><span className="text-xs text-muted-foreground">{updatedLabel(note)}</span></div></CardFooter>
            </Card>
          </Link>)}
        </nav> : <div className="notes-library__empty"><FileText className="size-10 text-muted-foreground" aria-hidden="true" /><p>{query.trim() ? "Ничего не найдено" : "Здесь будут ваши документы"}</p><p className="text-muted-foreground">{query.trim() ? "Попробуйте другое название." : "Начните с чистого листа или выберите шаблон выше."}</p>{query.trim() && <Button variant="outline" className="rounded-full" onClick={() => setQuery("")}>Сбросить поиск</Button>}</div>)}
    </section>
  </>;
}
