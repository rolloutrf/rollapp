import { useState } from "react";
import { BookOpen, Download, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  IdentityGeneratedDocuments, IdentityReportControls, IdentityReportEmpty,
  IdentityReportStatus, useIdentityReport,
} from "@/components/identity-report-manager";
import topFivePdfUrl from "@/assets/gallup/cliftonstrengths-top-5.pdf?url";
import fullProfilePdfUrl from "@/assets/gallup/cliftonstrengths-34.pdf?url";
import {
  REPORT_GUIDANCE,
  THEME_DESCRIPTIONS,
  TOP_FIVE_ARTICLES,
  TOP_TEN_DEVELOPMENT,
} from "@/data/gallup-report-content";

const GALLUP_DOMAINS = {
  influencing: {
    label: "Влияние",
    description: "Брать инициативу, говорить прямо и помогать другим быть услышанными.",
  },
  strategic: {
    label: "Стратегическое мышление",
    description: "Собирать и анализировать информацию для более сильных решений.",
  },
  executing: {
    label: "Исполнение",
    description: "Превращать намерения в результат и доводить важное до конца.",
  },
  relationship: {
    label: "Построение отношений",
    description: "Создавать связи, которые удерживают людей и команды вместе.",
  },
};

const GALLUP_STRENGTHS = [
  { rank: 1, name: "Learner", translation: "Обучаемость", domain: "strategic" },
  { rank: 2, name: "Self-Assurance", translation: "Уверенность в себе", domain: "influencing" },
  { rank: 3, name: "Achiever", translation: "Достижение", domain: "executing" },
  { rank: 4, name: "Focus", translation: "Фокус", domain: "executing" },
  { rank: 5, name: "Command", translation: "Командование", domain: "influencing" },
  { rank: 6, name: "Activator", translation: "Активатор", domain: "influencing" },
  { rank: 7, name: "Analytical", translation: "Аналитик", domain: "strategic" },
  { rank: 8, name: "Maximizer", translation: "Максимизатор", domain: "influencing" },
  { rank: 9, name: "Significance", translation: "Значимость", domain: "influencing" },
  { rank: 10, name: "Belief", translation: "Убеждённость", domain: "executing" },
  { rank: 11, name: "Intellection", translation: "Мышление", domain: "strategic" },
  { rank: 12, name: "Relator", translation: "Близость", domain: "relationship" },
  { rank: 13, name: "Responsibility", translation: "Ответственность", domain: "executing" },
  { rank: 14, name: "Ideation", translation: "Генерация идей", domain: "strategic" },
  { rank: 15, name: "Arranger", translation: "Организатор", domain: "executing" },
  { rank: 16, name: "Individualization", translation: "Индивидуализация", domain: "relationship" },
  { rank: 17, name: "Futuristic", translation: "Видение будущего", domain: "strategic" },
  { rank: 18, name: "Connectedness", translation: "Связанность", domain: "relationship" },
  { rank: 19, name: "Input", translation: "Сбор информации", domain: "strategic" },
  { rank: 20, name: "Context", translation: "Контекст", domain: "strategic" },
  { rank: 21, name: "Strategic", translation: "Стратег", domain: "strategic" },
  { rank: 22, name: "Competition", translation: "Конкуренция", domain: "influencing" },
  { rank: 23, name: "Discipline", translation: "Дисциплина", domain: "executing" },
  { rank: 24, name: "Deliberative", translation: "Осмотрительность", domain: "executing" },
  { rank: 25, name: "Positivity", translation: "Позитивность", domain: "relationship" },
  { rank: 26, name: "Harmony", translation: "Гармония", domain: "relationship" },
  { rank: 27, name: "Woo", translation: "Обаяние", domain: "influencing" },
  { rank: 28, name: "Communication", translation: "Коммуникация", domain: "influencing" },
  { rank: 29, name: "Restorative", translation: "Восстановление", domain: "executing" },
  { rank: 30, name: "Consistency", translation: "Последовательность", domain: "executing" },
  { rank: 31, name: "Includer", translation: "Вовлечение", domain: "relationship" },
  { rank: 32, name: "Empathy", translation: "Эмпатия", domain: "relationship" },
  { rank: 33, name: "Adaptability", translation: "Адаптивность", domain: "relationship" },
  { rank: 34, name: "Developer", translation: "Развитие других", domain: "relationship" },
];

const TOP_FIVE_DETAILS = {
  1: {
    summary: "Вас заряжает сам процесс освоения нового. Вы углубляетесь в детали и постоянно наращиваете компетентность.",
    action: "Регулярно выбирайте сложную тему или навык и превращайте обучение в проект с заметными этапами.",
  },
  2: {
    summary: "Вы опираетесь на внутренний компас, готовы идти на просчитанный риск и принимать решения в неопределённости.",
    action: "Доверяйте интуиции, но перед важным решением собирайте достаточно внешних данных и обратной связи.",
  },
  3: {
    summary: "У вас много внутренней энергии для работы, а занятость, прогресс и завершённые задачи дают чувство удовлетворения.",
    action: "Направляйте интенсивность на главные приоритеты и отмечайте завершения до перехода к следующей цели.",
  },
  4: {
    summary: "Вы задаёте направление, расставляете приоритеты и корректируете курс, не теряя из виду конечную цель.",
    action: "Формулируйте конкретные цели со сроками и регулярно убирайте задачи, которые не ведут к результату.",
  },
  5: {
    summary: "Вы умеете занять ясную позицию, взять ситуацию под контроль и принять решение, когда другие колеблются.",
    action: "Используйте прямоту как опору: сначала уточняйте, нужна ли людям ваша интервенция или совместный поиск решения.",
  },
};

const DOMAIN_ORDER = ["influencing", "strategic", "executing", "relationship"];

const GALLUP_REPORTS = [
  {
    id: "top-five",
    label: "Пять ведущих",
    countLabel: "5 тем",
    title: "Пять ведущих талантов Михаила Колоскова",
    description: "Персональные особенности, сочетания и способы применения пяти ведущих талантов.",
    pdfUrl: topFivePdfUrl,
  },
  {
    id: "profile-34",
    label: "Все 34",
    countLabel: "34 темы",
    title: "Ваши результаты по 34 талантам CliftonStrengths",
    description: "Последовательность всех тем, ведущие десять талантов, домены, рекомендации и потенциальные слепые зоны.",
    pdfUrl: fullProfilePdfUrl,
  },
];

function domainStyle(domain) {
  return { "--gallup-domain": `var(--gallup-${domain})` };
}

function strengthByRank(rank) {
  return GALLUP_STRENGTHS[rank - 1];
}

function ReportMasthead({ report, children }) {
  return (
    <header className="gallup-web-report__masthead">
      <div className="gallup-web-report__brandline">
        <span>Gallup</span>
        <time dateTime="2023-05-19">Михаил Колосков · 19 мая 2023</time>
      </div>
      <p className="gallup-web-report__kicker">Персональный отчёт CliftonStrengths</p>
      <h3 id={`gallup-report-${report.id}`}>{report.title}</h3>
      <p>{report.description}</p>
      {children}
    </header>
  );
}

function StrengthNavigation({ reportId, strengths }) {
  return (
    <nav className="gallup-web-report__nav" aria-label="Разделы отчёта">
      {strengths.map((strength) => (
        <a key={strength.rank} href={`#${reportId}-strength-${strength.rank}`} style={domainStyle(strength.domain)}>
          <span>{strength.rank}</span>
          {strength.translation}
        </a>
      ))}
    </nav>
  );
}

function StrengthChapterHeader({ strength, eyebrow }) {
  return (
    <header className="gallup-report-chapter__heading">
      <span className="gallup-report-chapter__rank">{strength.rank}</span>
      <div>
        <p>{eyebrow || GALLUP_DOMAINS[strength.domain].label}</p>
        <h4>{strength.translation}</h4>
        <span>Талант CliftonStrengths</span>
      </div>
    </header>
  );
}

function TopFiveWebReport({ report }) {
  const guidance = REPORT_GUIDANCE.topFive;

  return (
    <section className="gallup-web-report" aria-labelledby={`gallup-report-${report.id}`}>
      <ReportMasthead report={report}>
        <StrengthNavigation reportId={report.id} strengths={GALLUP_STRENGTHS.slice(0, 5)} />
      </ReportMasthead>

      <section className="gallup-web-report__intro">
        <BookOpen aria-hidden="true" />
        <div>
          <h4>Ваша уникальная сила</h4>
          <p>
            Уникальная последовательность талантов и персональные выводы ниже основаны на ваших ответах при прохождении оценки.
            Они помогут понять ведущие сильные стороны, их взаимодействие и способы применения для достижения целей.
          </p>
        </div>
      </section>

      <div className="gallup-report-chapters">
        {TOP_FIVE_ARTICLES.map((article) => {
          const strength = strengthByRank(article.rank);
          return (
            <article
              key={article.rank}
              id={`${report.id}-strength-${article.rank}`}
              className="gallup-report-chapter"
              style={domainStyle(article.domain)}
            >
              <StrengthChapterHeader strength={strength} />

              <div className="gallup-report-chapter__definition">
                <h5>Что такое «{strength.translation}»?</h5>
                <p>{article.whatIs}</p>
              </div>

              <section className="gallup-report-chapter__insights">
                <div className="gallup-report-block__title">
                  <span>Персональный профиль</span>
                  <h5>Как уникально проявляется талант «{strength.translation}»</h5>
                </div>
                <div className="gallup-report-prose">
                  {article.unique.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>

              <section className="gallup-report-chapter__blends">
                <div className="gallup-report-block__title">
                  <span>Сочетания талантов</span>
                  <h5>Как «{strength.translation}» сочетается с другими ведущими талантами</h5>
                </div>
                <div className="gallup-blend-grid">
                  {article.blends.map(([name, description]) => {
                    const pairedStrength = GALLUP_STRENGTHS.find((item) => item.name === name);
                    return (
                    <div key={name}>
                      <strong>{strength.translation} + {pairedStrength?.translation || name}</strong>
                      <p>{description}</p>
                    </div>
                    );
                  })}
                </div>
              </section>

              <section className="gallup-report-action">
                <div>
                  <span>Применяйте талант «{strength.translation}» для успеха</span>
                  <h5>{article.applyLead}</h5>
                  <ul>{article.apply.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </section>
            </article>
          );
        })}
      </div>

      <section className="gallup-report-next" id={`${report.id}-next`}>
        <div className="gallup-report-block__title">
          <span>Развитие</span>
          <h4>{guidance.title}</h4>
          <p>{guidance.intro}</p>
        </div>
        <div className="gallup-guidance-grid">
          {guidance.groups.map((group) => (
            <article key={group.title}>
              <h5>{group.title}</h5>
              <p>{group.body}</p>
              {group.items ? <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function FullProfileWebReport({ report }) {
  const guidance = REPORT_GUIDANCE.fullProfile;
  const topTen = GALLUP_STRENGTHS.slice(0, 10);

  return (
    <section className="gallup-web-report" aria-labelledby={`gallup-report-${report.id}`}>
      <ReportMasthead report={report}>
        <StrengthNavigation reportId={report.id} strengths={topTen} />
      </ReportMasthead>

      <section className="gallup-web-report__intro gallup-web-report__intro--wide">
        <BookOpen aria-hidden="true" />
        <div>
          <h4>Раскройте свой потенциал</h4>
          <p>
            Таланты в верхней части профиля обладают наибольшей силой. Начните с первых пяти, затем примените те же
            подходы к темам 6-10: изучайте, осмысляйте, используйте их каждый день и следите за слепыми зонами.
          </p>
        </div>
      </section>

      <div className="gallup-report-chapters gallup-report-chapters--development">
        {TOP_TEN_DEVELOPMENT.map((development) => {
          const strength = strengthByRank(development.rank);
          const personalized = TOP_FIVE_ARTICLES.find((article) => article.rank === development.rank);
          return (
            <article
              key={development.rank}
              id={`${report.id}-strength-${development.rank}`}
              className="gallup-report-chapter"
              style={domainStyle(strength.domain)}
            >
              <StrengthChapterHeader strength={strength} />
              <p className="gallup-report-chapter__thrive">{development.thrive}</p>

              {personalized ? (
                <section className="gallup-report-chapter__insights">
                  <div className="gallup-report-block__title">
                    <span>Персональный профиль</span>
                    <h5>Как уникально проявляется талант «{strength.translation}»</h5>
                  </div>
                  <div className="gallup-report-prose gallup-report-prose--columns">
                    {personalized.unique.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>
              ) : null}

              <div className="gallup-development-grid">
                <section className="gallup-development-success">
                  <span>Почему «{strength.translation}» помогает вам добиваться успеха</span>
                  <p>{development.succeed}</p>
                </section>
                <section className="gallup-development-actions">
                  <div className="gallup-report-block__title">
                    <span>Действия для раскрытия потенциала</span>
                    <h5>{development.actionLead}</h5>
                  </div>
                  <ul>{development.actions.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section className="gallup-development-blindspots">
                  <TriangleAlert aria-hidden="true" />
                  <div>
                    <h5>Обратите внимание на слепые зоны</h5>
                    <ul>{development.blindSpots.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </div>

      <section className="gallup-report-next" id={`${report.id}-navigate`}>
        <div className="gallup-report-block__title">
          <span>Темы 11-34</span>
          <h4>Как использовать остальные таланты</h4>
          <p>Ведущие темы дают наибольшие возможности для успеха, но все 34 таланта помогают понять вашу уникальную структуру.</p>
        </div>
        <div className="gallup-guidance-grid gallup-guidance-grid--three">
          {guidance.navigation.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h5>{title}</h5>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="gallup-weakness-guide">
        <div>
          <p className="gallup-profile__eyebrow">Что такое слабость?</p>
          <h4>Всё, что мешает вашему успеху</h4>
          <p>
            Высокая тема может превратиться в слепую зону, а низкая - отнимать силы, если она необходима в вашей роли.
            Используйте эти вопросы для поиска слабых мест, не считая низкую позицию темы слабостью автоматически.
          </p>
          <ul>{guidance.weaknessQuestions.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="gallup-weakness-actions">
          {guidance.weaknessActions.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="gallup-theme-library" id={`${report.id}-sequence`}>
        <div className="gallup-report-block__title">
          <span>Структура талантов</span>
          <h4>Ваша последовательность 34 талантов CliftonStrengths</h4>
          <p>Полная последовательность тем с определениями - без разбиения на страницы.</p>
        </div>
        <div className="gallup-theme-library__grid">
          {GALLUP_STRENGTHS.map((strength) => (
            <article key={strength.rank} style={domainStyle(strength.domain)}>
              <div>
                <span>{strength.rank}</span>
                <p>{GALLUP_DOMAINS[strength.domain].label}</p>
              </div>
              <h5>{strength.translation}</h5>
              <small>Тема №{strength.rank}</small>
              <p>{THEME_DESCRIPTIONS[strength.rank]}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DefaultGallupProfile() {
  const [selectedRank, setSelectedRank] = useState(1);
  const [activeReportId, setActiveReportId] = useState(GALLUP_REPORTS[0].id);
  const selectedStrength = GALLUP_STRENGTHS[selectedRank - 1];
  const selectedDetails = TOP_FIVE_DETAILS[selectedRank];
  const selectedDomain = GALLUP_DOMAINS[selectedStrength.domain];
  const activeReport = GALLUP_REPORTS.find((report) => report.id === activeReportId) || GALLUP_REPORTS[0];

  return (
    <article className="gallup-profile" aria-labelledby="gallup-profile-title">
      <header className="gallup-profile__hero">
        <div className="gallup-profile__hero-copy">
          <p className="gallup-profile__eyebrow">CliftonStrengths 34</p>
          <h2 id="gallup-profile-title">Ваш профиль ведёт Влияние</h2>
          <p>{GALLUP_DOMAINS.influencing.description}</p>
        </div>
        <time dateTime="2023-05-19">19 мая 2023</time>
      </header>

      <div className="gallup-profile__domain-band" aria-label="Домены десяти ведущих талантов">
        {DOMAIN_ORDER.map((domain) => {
          const topTenCount = GALLUP_STRENGTHS.filter((strength) => strength.rank <= 10 && strength.domain === domain).length;
          return (
            <div
              key={domain}
              className="gallup-profile__domain-segment"
              style={{ ...domainStyle(domain), "--top-ten-count": Math.max(topTenCount, 0.42) }}
            >
              <span>{GALLUP_DOMAINS[domain].label}</span>
              <strong>{topTenCount} из 10</strong>
            </div>
          );
        })}
      </div>

      <div className="gallup-profile__section-head">
        <div>
          <p className="gallup-profile__eyebrow">Доминирующие таланты</p>
          <h3>Пять ведущих талантов</h3>
        </div>
        <p>Выберите талант, чтобы увидеть, как он проявляется и куда его направить.</p>
      </div>

      <div className="gallup-top-five">
        <ToggleGroup
          className="gallup-top-five__list w-full gap-0 max-[760px]:grid max-[760px]:grid-cols-5 max-[760px]:gap-[5px] max-[480px]:grid-cols-2"
          orientation="vertical"
          value={[String(selectedRank)]}
          onValueChange={(values) => { if (values[0]) setSelectedRank(Number(values[0])); }}
          aria-label="Пять ведущих талантов"
        >
          {GALLUP_STRENGTHS.slice(0, 5).map((strength) => {
            return (
              <ToggleGroupItem
                key={strength.rank}
                value={String(strength.rank)}
                className="gallup-strength-button grid h-auto w-full shrink grid-cols-[34px_minmax(0,1fr)_8px] justify-normal gap-2.5 rounded-none bg-transparent px-[13px] py-[11px] text-left hover:bg-[color-mix(in_oklch,var(--gallup-domain)_6%,transparent)] aria-pressed:bg-[linear-gradient(90deg,color-mix(in_oklch,var(--gallup-domain)_13%,transparent),transparent_72%)] max-[760px]:min-h-[72px] max-[760px]:grid-cols-1 max-[760px]:place-items-center max-[760px]:gap-px max-[760px]:px-[6px] max-[760px]:py-[9px] max-[760px]:text-center max-[480px]:min-h-[62px] max-[480px]:grid-cols-[28px_minmax(0,1fr)_7px] max-[480px]:justify-items-normal max-[480px]:gap-[7px] max-[480px]:px-[10px] max-[480px]:py-[8px] max-[480px]:text-left max-[480px]:last:col-span-2"
                style={domainStyle(strength.domain)}
              >
                <span className="gallup-strength-button__rank">{strength.rank}</span>
                <span className="gallup-strength-button__copy">
                  <strong>{strength.translation}</strong>
                  <small>{GALLUP_DOMAINS[strength.domain].label}</small>
                </span>
                <span className="gallup-strength-button__marker" aria-hidden="true" />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        <div className="gallup-strength-detail" style={domainStyle(selectedStrength.domain)} aria-live="polite">
          <div className="gallup-strength-detail__heading" data-not-typeset>
            <span className="gallup-strength-detail__rank">{selectedStrength.rank}</span>
            <div>
              <span className="gallup-strength-detail__domain">{selectedDomain.label}</span>
              <h3>{selectedStrength.translation}</h3>
              <p className="gallup-strength-detail__translation">Талант CliftonStrengths</p>
            </div>
          </div>
          <p className="gallup-strength-detail__summary">{selectedDetails.summary}</p>
          <div className="gallup-strength-detail__action">
            <span>Направить талант</span>
            <p>{selectedDetails.action}</p>
          </div>
        </div>
      </div>

      <div className="gallup-profile__section-head gallup-profile__section-head--sequence">
        <div>
          <p className="gallup-profile__eyebrow">Структура талантов</p>
          <h3>Все 34 таланта</h3>
        </div>
        <p>Первые 10 — основная зона развития. Остальные темы помогают ориентироваться и подключаются по ситуации.</p>
      </div>

      <div className="gallup-dna" role="img" aria-label="Последовательность 34 талантов, окрашенная по четырём доменам">
        {GALLUP_STRENGTHS.map((strength) => (
          <span
            key={strength.rank}
            className={strength.rank <= 10 ? "is-dominant" : undefined}
            style={domainStyle(strength.domain)}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="gallup-dna__labels" aria-hidden="true">
        <span>Развивать · 1–10</span>
        <span>Использовать по ситуации · 11–34</span>
      </div>

      <ol className="gallup-sequence not-typeset" aria-label="Рейтинг всех 34 талантов">
        {GALLUP_STRENGTHS.map((strength) => (
          <li key={strength.rank} className={strength.rank <= 10 ? "is-dominant" : undefined} style={domainStyle(strength.domain)}>
            <span className="gallup-sequence__rank">{strength.rank}</span>
            <span className="gallup-sequence__dot" aria-hidden="true" />
            <span className="gallup-sequence__name">{strength.translation}</span>
            <span className="gallup-sequence__translation">{GALLUP_DOMAINS[strength.domain].label}</span>
          </li>
        ))}
      </ol>

      <div className="gallup-domain-legend" aria-label="Легенда доменов">
        {DOMAIN_ORDER.map((domain) => (
          <div key={domain} className="gallup-domain-legend__item" style={domainStyle(domain)}>
            <span className="gallup-domain-legend__dot" aria-hidden="true" />
            <div>
              <strong>{GALLUP_DOMAINS[domain].label}</strong>
              <p>{GALLUP_DOMAINS[domain].description}</p>
            </div>
          </div>
        ))}
      </div>

      <aside className="gallup-profile__note">
        Низкая позиция темы не означает слабость: отчёт предлагает развивать ведущие таланты и осознанно подключать остальные.
      </aside>

      <div className="gallup-profile__section-head gallup-profile__section-head--reports">
        <div>
          <p className="gallup-profile__eyebrow">Материалы отчётов</p>
          <h3>Читать как веб-документ</h3>
        </div>
        <p>Весь текст перенесён в адаптивную вёрстку: без листов PDF, разрывов страниц и перехода на Яндекс Диск.</p>
      </div>

      <div className="gallup-report-toolbar">
        <ToggleGroup
          className="gallup-report-switcher inline-flex w-auto items-stretch gap-[22px] rounded-none max-[760px]:w-full max-[480px]:gap-[14px]"
          value={[activeReport.id]}
          onValueChange={(values) => { if (values[0]) setActiveReportId(values[0]); }}
          aria-label="Выбрать полный отчёт"
        >
          {GALLUP_REPORTS.map((report) => (
            <ToggleGroupItem
              key={report.id}
              value={report.id}
              className="h-auto min-h-12 min-w-0 shrink gap-2 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-[7px] pb-[10px] font-semibold aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:text-foreground"
            >
              <span>{report.label}</span>
              <small>{report.countLabel}</small>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <a
          className={cn(
            buttonVariants({ variant: "ghost", size: "lg" }),
            "gallup-report-download h-auto min-h-[42px] rounded-none border-0 bg-transparent px-0",
          )}
          href={activeReport.pdfUrl}
          download
        >
          <Download data-icon="inline-start" aria-hidden="true" />
          <span>Скачать PDF</span>
        </a>
      </div>

      {activeReport.id === "top-five"
        ? <TopFiveWebReport report={activeReport} />
        : <FullProfileWebReport report={activeReport} />}

      <footer className="gallup-profile__sources">
        <strong>Правовая информация</strong>
        <p>
          Материалы содержат защищённые исследования, авторские материалы и товарные знаки Gallup, Inc. Gallup,
          CliftonStrengths, Clifton StrengthsFinder, StrengthsFinder и названия 34 тем являются товарными знаками Gallup, Inc.
          Оригинальный документ целиком доступен по кнопке «Скачать PDF» выше.
        </p>
      </footer>
    </article>
  );
}

function GeneratedGallupProfile({ report }) {
  const strengths = report.strengths || [];
  const leadingDomain = GALLUP_DOMAINS[report.leadingDomain];
  const topStrength = strengths[0];
  const dateLabel = report.date
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${report.date}T12:00:00Z`))
    : "Дата не указана";

  return (
    <article className="gallup-profile gallup-profile--generated" aria-labelledby="gallup-generated-title">
      <header className="gallup-profile__hero">
        <div className="gallup-profile__hero-copy">
          <p className="gallup-profile__eyebrow">CliftonStrengths · создано из PDF</p>
          <h2 id="gallup-generated-title">
            {leadingDomain ? `Ваш профиль ведёт ${leadingDomain.label}` : report.title}
          </h2>
          <p>{leadingDomain?.description || "Содержание загруженных отчётов собрано в адаптивную веб-страницу."}</p>
          {report.person ? <p className="identity-generated-report__person">{report.person}</p> : null}
        </div>
        <time dateTime={report.date || undefined}>{dateLabel}</time>
      </header>

      {strengths.length ? (
        <>
          <div className="gallup-profile__section-head">
            <div>
              <p className="gallup-profile__eyebrow">Распознано из отчёта</p>
              <h3>{strengths.length >= 34 ? "Все 34 таланта" : `${strengths.length} ведущих талантов`}</h3>
            </div>
            <p>{topStrength ? `Первый талант — ${topStrength.translation}.` : "Последовательность сформирована из PDF."}</p>
          </div>
          <div className="gallup-dna" role="img" aria-label="Последовательность распознанных талантов">
            {strengths.map((strength) => (
              <span
                key={strength.rank}
                className={strength.rank <= 10 ? "is-dominant" : undefined}
                style={domainStyle(strength.domain)}
                aria-hidden="true"
              />
            ))}
          </div>
          <ol className="gallup-sequence not-typeset" aria-label="Рейтинг талантов из PDF">
            {strengths.map((strength) => (
              <li key={strength.rank} className={strength.rank <= 10 ? "is-dominant" : undefined} style={domainStyle(strength.domain)}>
                <span className="gallup-sequence__rank">{strength.rank}</span>
                <span className="gallup-sequence__dot" aria-hidden="true" />
                <span className="gallup-sequence__name">{strength.translation}</span>
                <span className="gallup-sequence__translation">{GALLUP_DOMAINS[strength.domain]?.label || strength.name}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <aside className="gallup-profile__note">Текст PDF распознан, но рейтинг талантов в документе не найден. Полное содержание доступно ниже.</aside>
      )}

      <IdentityGeneratedDocuments report={report} />
    </article>
  );
}

export function GallupProfile() {
  const { state, setState, error, load } = useIdentityReport("gallup");
  if (state.mode === "loading" || state.mode === "error") {
    return <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />;
  }
  return (
    <div className="identity-report-workspace">
      <IdentityReportControls section="gallup" label="Gallup" state={state} setState={setState} load={load} />
      {state.mode === "empty"
        ? <IdentityReportEmpty label="Gallup" />
        : state.mode === "generated"
          ? <GeneratedGallupProfile report={state.report} />
          : <DefaultGallupProfile />}
    </div>
  );
}
