import { Fragment } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import lifeStrategySource from "@/data/life-strategy.md?raw";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\[[^\]]*\]\((?:https?:\/\/|\/)[^)]+\)|https?:\/\/[^\s]+)/gu;
const CHECKLIST_PATTERN = /^- \[([ xX])\](.*)$/u;
const BULLET_PATTERN = /^- (.*)$/u;
const AGE_HEADING_PATTERN = /^#\s+(\d+\s+y\.o\.?)\s*$/iu;
const STRATEGY_HEADING_PATTERN = /^##\s+(Platform|Seller|Buyer)\s*$/u;

function renderInline(text, keyPrefix) {
  return text.split(INLINE_PATTERN).map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;
    const strong = part.match(/^\*\*(.*)\*\*$/su);
    const link = part.match(/^\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)$/u);

    if (strong) {
      return <strong key={key}>{renderInline(strong[1], `${key}-strong`)}</strong>;
    }
    if (link) {
      const external = link[2].startsWith("http");
      return (
        <a key={key} href={link[2]} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
          {link[1]}
        </a>
      );
    }
    if (part.match(/^https?:\/\//u)) {
      return <a key={key} href={part} target="_blank" rel="noreferrer">{part}</a>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function InlineContent({ text, lineIndex }) {
  return renderInline(text, String(lineIndex));
}

function SourceLine({ line, index }) {
  const label = line.match(/^:::label\s+(.+)$/u);
  const statement = line.match(/^:::statement\s+(.+)$/u);
  const heading = line.match(/^(#{1,3}) (.*)$/u);
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
    const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
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

function SourceList({ items, taskList }) {
  return (
    <ul className={taskList ? "contains-task-list" : undefined}>
      {items.map(({ checked, index, text }) => (
        <li className={taskList ? "task-list-item" : undefined} key={`${index}-${text}`}>
          {taskList && <input type="checkbox" checked={checked} disabled readOnly />}
          <InlineContent text={text} lineIndex={index} />
        </li>
      ))}
    </ul>
  );
}

function renderSourceBlocks(lines) {
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const firstItem = getListItem(lines[index]);
    if (!firstItem) {
      blocks.push(<SourceLine key={`${index}-${lines[index]}`} line={lines[index]} index={index} />);
      index += 1;
      continue;
    }

    const startIndex = index;
    const items = [];
    while (index < lines.length) {
      const item = getListItem(lines[index]);
      if (!item || item.kind !== firstItem.kind) break;
      items.push({ ...item, index });
      index += 1;
    }
    blocks.push(<SourceList key={`list-${startIndex}`} items={items} taskList={firstItem.kind === "task"} />);
  }

  return blocks;
}

function splitAgeSections(lines) {
  const introduction = [];
  const sections = [];
  let currentSection = null;

  lines.forEach((line) => {
    const ageHeading = line.match(AGE_HEADING_PATTERN);
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
    const sectionHeading = line.match(STRATEGY_HEADING_PATTERN);
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

function StrategySections({ lines }) {
  const { introduction, sections } = splitStrategySections(lines);

  return (
    <>
      {renderSourceBlocks(introduction)}
      <Accordion
        className="mt-[calc(var(--typeset-flow)*2.4)]"
        hiddenUntilFound
        multiple
      >
        {sections.map((section) => (
          <AccordionItem className="border-border/70" key={section.id} value={section.id}>
            <AccordionTrigger
              className="min-h-12 w-full items-center py-5 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:size-5"
              headerAs="h2"
            >
              <span className="text-3xl leading-9 font-semibold tracking-tight text-foreground">
                {section.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-8 [&_p:not(:last-child)]:mb-0">
              <section data-typeset-group>
                {renderSourceBlocks(section.lines)}
              </section>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

function AgeSections({ lines }) {
  const { introduction, sections } = splitAgeSections(lines);

  return (
    <>
      <StrategySections lines={introduction} />
      <Accordion
        className="mt-[calc(var(--typeset-flow)*2.4)]"
        hiddenUntilFound
        multiple
      >
        {sections.map((section) => (
          <AccordionItem className="border-border/70" key={section.id} value={section.id}>
            <AccordionTrigger
              className="min-h-12 w-full items-center py-6 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:size-5"
              headerAs="h1"
            >
              <span className="text-4xl leading-10 font-extrabold tracking-tight text-foreground">
                {section.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-8 [&_p:not(:last-child)]:mb-0">
              <section data-typeset-group>
                {renderSourceBlocks(section.lines)}
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
}) {
  const lines = source.replace(/\n$/u, "").split("\n");
  return (
    <article className={`life-strategy-source typeset typeset-rollapp typeset-document ${className}`.trim()} aria-label={label}>
      {collapsibleAges
        ? <AgeSections lines={lines} />
        : collapsibleStrategies
          ? <StrategySections lines={lines} />
          : renderSourceBlocks(lines)}
    </article>
  );
}

export function LifeStrategy() {
  return <MarkdownDocument source={lifeStrategySource} label="Жизненная стратегия" collapsibleAges />;
}
