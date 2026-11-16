import { IdentityGeneratedDocuments, IdentityReportOverview, IdentityReportEmpty } from "@/modules/identity/identity-report-manager.jsx";
import { IdentityReportsPage } from "@/modules/identity/identity-reports-page.jsx";
import { FourQuestions } from "@/modules/identity/four-questions.jsx";
import { Page, Scenario, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-identity", title: "РОЛЛАПП/Модули РОЛЛАПП/22 Идентичность" };

const generated = { documents: [{
  id: "example-report", filename: "Пример отчёта.pdf",
  layout: { version: 1, pages: [{ number: 1, blocks: [
    { type: "heading", level: 3, text: "Результаты оценки" },
    { type: "paragraph", text: "Пример показывает, как переносы строк и таблицы выглядят после импорта PDF." },
    { type: "table", headers: ["Шкала", "Значение"], rows: [["Амбициозность", "84"], ["Адаптация", "51"]] },
    { type: "score-chart", rows: [{ label: "Амбициозность", value: "84", color: "#ffb000" }, { label: "Адаптация", value: "51", color: "#ffb000" }] },
  ] }] },
}] };

function Reports({ state }) {
  const tests = [{ id: "example-report", title: "Стиль работы" }];
  return <Scenario path="/app/spheres/identity?tab=reports" routes={{
    "GET /identity/reports": state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Не удалось загрузить отчёты."); } : { tests: state === "empty" ? [] : tests },
    "GET /identity/reports/*": { mode: "empty", files: [], report: null },
    "POST /identity/reports": (_, values) => ({ test: { id: "example-new", title: values.title } }),
  }}><Page className="typeset typeset-rollapp">
    <IdentityReportsPage renderGallup={() => <IdentityReportEmpty label="Gallup" />} renderHogan={() => <IdentityReportEmpty label="Hogan" />} />
  </Page></Scenario>;
}

export const Generated = { name: "Отчёт · текст, таблица и шкалы", render: () => <Page className="typeset typeset-rollapp"><div className="identity-report-workspace">
  <IdentityGeneratedDocuments report={generated} />
</div></Page> };
export const Overview = { name: "Заголовок отчёта и метрики", render: () => <Page className="typeset typeset-rollapp"><div className="identity-report-workspace">
  <IdentityReportOverview titleId="identity-overview" title="Сильные стороны" eyebrow="Gallup" description="Результаты и динамика." stats={[{ label: "Темы", value: "34" }, { label: "Приоритеты", value: "5" }]} />
</div></Page> };
export const List = { name: "Личностные тесты", render: Reports, args: { state: "ready" } };
export const Empty = { ...List, name: "Отчётов ещё нет", args: { state: "empty" } };
export const Loading = { ...List, name: "Загрузка отчётов", args: { state: "loading" } };
export const Error = { ...List, name: "Ошибка чтения отчётов", args: { state: "error" } };
export const Questions = { name: "Четыре вопроса", render: () => <Scenario routes={{ "GET /identity/content/four-questions": { content: "" }, "PATCH /identity/content/four-questions": (_, body) => body }}><Page className="typeset typeset-rollapp"><FourQuestions /></Page></Scenario> };
