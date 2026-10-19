import { useId } from "react";
import { InlineMarkdown } from "@/components/inline-markdown";
import { EditableTextBlock } from "@/components/editable-text-block";
import { Pencil } from "lucide-react";
import { CareerIconAction } from "@/components/career-icon-action";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import lifeStrategySource from "@/data/life-strategy.md?raw";

const CHECKLIST_PATTERN = /^- \[([ xX])\](.*)$/u;
const BULLET_PATTERN = /^- (.*)$/u;
const AGE_HEADING_PATTERN = /^#\s+(\d+\s+y\.o\.?)\s*$/iu;
const STRATEGY_HEADING_PATTERN = /^##\s+(Platform|Seller|Buyer)\s*$/u;

function InlineContent({ text }) {
  return <InlineMarkdown text={text} />;
}

function SourceLine({ line, index }) {
  const label = line.match(/^:::label\s+(.+)$/u);
  const statement = line.match(/^:::statement\s+(.+)$/u);
  const heading = line.match(/^(#{1,6}) (.*)$/u);
  const quote = line.match(/^> ?(.*)$/u);
  const image = line.match(/^!\[(.*)\]\((https?:\/\/[^)]+)\)$/u);

  if (line === "" || line === "---") return null;

  if (label) {
    return <p className="mission-text__label" data-typography="label"><InlineContent text={label[1]} lineIndex={index} /></p>;
  }

  if (statement) {
    return <p className="mission-text__closing" data-typography="statement"><InlineContent text={statement[1]} lineIndex={index} /></p>;
  }

  if (image) {
    return (
      <figure>
        <img src={image[2]} alt={image[1]} />
        {image[1] && <figcaption>{image[1]}</figcaption>}
      </figure>
    );
  }

  if (heading) {
    const level = heading[1].length;
    const Tag = `h${level}`;
    return (
      <Tag>
        <InlineContent text={heading[2]} lineIndex={index} />
      </Tag>
    );
  }

  if (quote) {
    return (
      <blockquote>
        <p>
          <InlineContent text={quote[1]} lineIndex={index} />
        </p>
      </blockquote>
    );
  }

  return (
    <p>
      <InlineContent text={line} lineIndex={index} />
    </p>
  );
}

function getListItem(line) {
  const checklist = line.match(CHECKLIST_PATTERN);
  if (checklist) {
    return {
      kind: "task",
      checked: checklist[1].toLowerCase() === "x",
      text: checklist[2].trimStart(),
    };
  }

  const bullet = line.match(BULLET_PATTERN);
  return bullet ? { kind: "bullet", text: bullet[1] } : null;
}

function SourceList({ items, onTaskCheckedChange, taskDisabled = false, taskReadOnly = false, taskList }) {
  const listId = useId();
  const interactive = taskList && typeof onTaskCheckedChange === "function";
  return (
    <ul className={taskList ? "contains-task-list" : undefined}>
      {items.map(({ checked, index, text }) => (
        <li className={taskList ? "task-list-item" : undefined} key={`${index}-${text}`}>
          {taskList ? (
            <Field className="task-list-item__field" data-disabled={taskDisabled || !interactive} orientation="horizontal">
              <Checkbox
                checked={checked}
                disabled={taskDisabled || !interactive}
                readOnly={taskReadOnly}
                id={`${listId}-${index}`}
                onCheckedChange={(nextChecked) => onTaskCheckedChange?.(index, nextChecked === true)}
              />
              <FieldLabel className="task-list-item__label" htmlFor={`${listId}-${index}`}>
                <InlineContent text={text} lineIndex={index} />
              </FieldLabel>
            </Field>
          ) : <InlineContent text={text} lineIndex={index} />}
        </li>
      ))}
    </ul>
  );
}

function hasRichSourceBlocks(source, lines) {
  return /^(?:[ \t]*(?:[-+*]|\d+[.)])\s+)/m.test(source) || /^!\[.*\]\(/m.test(source) || source.includes('<div data-inline-block="true">') || source.includes('<table data-inline-table="true"') || /^ {0,3}(`{3,}|~{3,})/m.test(source)
    || lines.some((line,index) => line.text.includes("|") && /^[ \t|:]*-[ \t|:-]*$/.test(lines[index + 1]?.text || "") && lines[index + 1].text.includes("|"));
}

function renderSourceBlocks(lines, taskOptions = {}) {
  const source = lines.map(line => line.text).join("\n");
  if (!taskOptions.onTaskCheckedChange && hasRichSourceBlocks(source, lines)) {
    return <EditableTextBlock value={source} readOnly label={taskOptions.label || "Текст раздела"} />;
  }
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const firstItem = getListItem(lines[index].text);
    if (!firstItem) {
      blocks.push(<SourceLine key={`${lines[index].index}-${lines[index].text}`} line={lines[index].text} index={lines[index].index} />);
      index += 1;
      continue;
    }

    const startIndex = lines[index].index;
    const items = [];
    while (index < lines.length) {
      const item = getListItem(lines[index].text);
      if (!item || item.kind !== firstItem.kind) break;
      items.push({ ...item, index: lines[index].index });
      index += 1;
    }
    blocks.push(<SourceList key={`list-${startIndex}`} items={items} taskList={firstItem.kind === "task"} {...taskOptions} />);
  }

  return blocks;
}

function splitAgeSections(lines) {
  const introduction = [];
  const sections = [];
  let currentSection = null;

  lines.forEach((line) => {
    const ageHeading = line.text.match(AGE_HEADING_PATTERN);
    if (ageHeading) {
      const age = ageHeading[1];
      currentSection = {
        id: `age-${age.match(/\d+/u)[0]}`,
        title: age,
        lines: [],
      };
      sections.push(currentSection);
      return;
    }

    if (currentSection) currentSection.lines.push(line);
    else introduction.push(line);
  });

  return { introduction, sections };
}

function splitStrategySections(lines) {
  const introduction = [];
  const sections = [];
  let currentSection = null;

  lines.forEach((line) => {
    const sectionHeading = line.text.match(STRATEGY_HEADING_PATTERN);
    if (sectionHeading) {
      const title = sectionHeading[1];
      currentSection = {
        id: `strategy-${title.toLowerCase()}`,
        title,
        lines: [],
      };
      sections.push(currentSection);
      return;
    }

    if (currentSection) currentSection.lines.push(line);
    else introduction.push(line);
  });

  return { introduction, sections };
}

function StrategySections({ lines, onTaskCheckedChange, taskDisabled, taskReadOnly }) {
  const { introduction, sections } = splitStrategySections(lines);
  const taskOptions = { onTaskCheckedChange, taskDisabled, taskReadOnly };

  if (!sections.length) return <>{renderSourceBlocks(introduction, taskOptions)}</>;

  return (
    <>
      {renderSourceBlocks(introduction, taskOptions)}
      <Accordion
        className="document-accordion"
        hiddenUntilFound
        multiple
      >
        {sections.map((section) => (
          <AccordionItem className="border-border/70" key={section.id} value={section.id}>
            <AccordionTrigger
              className="min-h-12 w-full items-center py-4 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:size-5"
              headerAs="h2"
            >
              <span className="text-3xl leading-9 font-semibold tracking-tight text-foreground">
                {section.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-8 [&_p:not(:last-child)]:mb-0">
              <section data-typeset-group>
                {renderSourceBlocks(section.lines, taskOptions)}
              </section>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

function AgeSections({ editDisabled = false, lines, onEditAge, onTaskCheckedChange, taskDisabled, taskReadOnly }) {
  const { introduction, sections } = splitAgeSections(lines);
  const taskOptions = { onTaskCheckedChange, taskDisabled, taskReadOnly };

  if (!sections.length) return <StrategySections lines={introduction} {...taskOptions} />;

  return (
    <>
      <StrategySections lines={introduction} {...taskOptions} />
      <Accordion
        className="document-accordion"
        hiddenUntilFound
        multiple
      >
        {sections.map((section) => (
          <AccordionItem className="border-border/70" key={section.id} value={section.id}>
            <AccordionTrigger
              className="min-h-12 w-full items-center py-4 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:size-5"
              headerAs="h1"
              action={onEditAge ? (
                <div className="not-typeset flex items-center gap-2 self-center" role="group" aria-label={`Действия периода ${section.title}`}>
                  {onEditAge && (
                    <CareerIconAction
                      disabled={editDisabled}
                      label={`Редактировать период ${section.title}`}
                      onClick={() => onEditAge(section.title)}
                    >
                      <Pencil aria-hidden="true" />
                    </CareerIconAction>
                  )}
                </div>
              ) : null}
            >
              <span className="text-4xl leading-10 font-extrabold tracking-tight text-foreground">
                {section.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-8 [&_p:not(:last-child)]:mb-0">
              <section data-typeset-group>
                {renderSourceBlocks(section.lines, taskOptions)}
              </section>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

export function MarkdownDocument({
  source, label, className = "", collapsibleAges = false, collapsibleStrategies = false,
  ageEditDisabled = false, hideSourceLabels = false, onEditAge,
  onTaskCheckedChange, taskDisabled = false, taskReadOnly = false,
}) {
  const lines = source
    .replace(/\n$/u, "")
    .split("\n")
    .map((text, index) => ({ index, text }))
    .filter((line) => !hideSourceLabels || !/^:::label\s+/u.test(line.text));
  const taskOptions = { onTaskCheckedChange, taskDisabled, taskReadOnly };
  const richBlocks = hasRichSourceBlocks(source, lines);
  return (
    <article className={`life-strategy-source typeset typeset-rollapp typeset-document ${className}`.trim()} aria-label={label}>
      {richBlocks && !collapsibleAges && !collapsibleStrategies && !onTaskCheckedChange
        ? <EditableTextBlock value={lines.map(line => line.text).join("\n")} readOnly label={label} />
        : collapsibleAges
        ? <AgeSections lines={lines} editDisabled={ageEditDisabled} onEditAge={onEditAge} {...taskOptions} />
        : collapsibleStrategies
          ? <StrategySections lines={lines} {...taskOptions} />
          : renderSourceBlocks(lines, taskOptions)}
    </article>
  );
}

export function LifeStrategy() {
  return (
    <div className="sphere-text-page page-stack">
      <MarkdownDocument source={lifeStrategySource} label="Жизненная стратегия" collapsibleAges />
    </div>
  );
}
