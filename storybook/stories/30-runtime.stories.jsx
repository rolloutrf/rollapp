import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingScreen, EmptyState, NotFound } from "@/modules/shell/page-feedback.jsx";
import { Page, Scenario } from "../support.jsx";

export default { id: "rollapp-runtime", title: "РОЛЛАПП/Модули/30 Запуск и эксплуатация" };

export const Loading = { name: "Загрузка приложения", render: () => <Page><LoadingScreen /></Page> };
export const CompactLoading = { name: "Загрузка внутри раздела", render: () => <Page><LoadingScreen compact /></Page> };
export const Unavailable = { name: "Сервис временно недоступен", render: () => <Page title="Ошибка подключения"><Alert variant="destructive">
  <AlertTitle>Не удалось загрузить данные</AlertTitle><AlertDescription>Сервер временно недоступен. Подождите и попробуйте снова.</AlertDescription>
</Alert></Page> };
export const Empty = { name: "Данных пока нет", render: () => <Page><EmptyState title="Данных пока нет" text="Новые записи появятся в этом разделе." action={<Button variant="outline">Обновить</Button>} /></Page> };
export const Missing = { name: "Страница не найдена", render: () => <Scenario><Page><NotFound /></Page></Scenario> };
