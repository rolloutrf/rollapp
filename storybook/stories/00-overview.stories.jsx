import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { localizedPageUrl } from "../../shared/modules/shell/page-urls.js";
import { PLATFORM_HOST } from "../../shared/modules/shell/applications.js";
import { Page } from "../support.jsx";
import { modules } from "../modules.js";

export default { id: "rollapp-guide", title: "РОЛЛАПП/Обзор" };

export const Catalog = {
  name: "Каталог модулей",
  render: () => <Page className="typeset typeset-rollapp">
    <header>
      <h1>Интерфейсы РОЛЛАПП</h1>
      <p>Откройте модуль в меню слева. Соседние истории показывают его состояния, а Controls позволяют изменить параметры. В верхней панели можно выбрать тему и размер окна.</p>
      <p>Действия в историях работают с примерами. Ссылки «В приложении» открывают реальный РОЛЛАПП в отдельной вкладке.</p>
    </header>
    <section>
      <h2>Модули</h2>
      <div className="not-typeset rollapp-story__examples">
        {modules.map(([number, label, id, path]) => <Card key={number} className="grid gap-2 rounded-2xl p-4">
          <a className="rollapp-body font-medium underline-offset-4 hover:underline" href={`./?path=/story/rollapp-${id}`} target="_top">{number} <span>{label}</span></a>
          {path && <a className="flex w-fit items-center gap-1 text-muted-foreground hover:underline" href={`https://${PLATFORM_HOST}${localizedPageUrl(path)}`} target="_blank" rel="noreferrer">
            <span>В приложении</span><ExternalLink size={14} aria-hidden="true" />
          </a>}
        </Card>)}
      </div>
    </section>
  </Page>,
};
