export const IDENTITY_TABS = [
  {
    id: "four-questions",
    label: "4 вопроса",
    description: "Каков этот мир, кто я, каково моё место и чего я хочу.",
  },
  {
    id: "values",
    label: "Ценности",
    description: "Личные принципы и критерии, на которые вы опираетесь в решениях.",
  },
  {
    id: "character",
    label: "Характер",
    description: "Черты характера, устойчивые способы реагировать и проявлять себя.",
  },
  {
    id: "identity-reports",
    label: "Тесты",
    description: "Сильные стороны, рабочий стиль, ценности и возможные риски в одном профиле.",
  },
  {
    id: "mission",
    label: "Миссия",
    description: "Формулировка личной миссии и ориентиров для принятия решений.",
  },
  {
    id: "ideal-state",
    label: "Идеальное состояние",
    description: "Жизнь и самоощущение, к которым вы стремитесь.",
  },
  {
    id: "life-strategy",
    label: "Жизненная стратегия",
    description: "Цели, приоритеты и план движения по ключевым жизненным горизонтам.",
  },
  {
    id: "personal-development-plan",
    label: "Персональный План Развития",
    description: "Текущий и желаемый образ жизни, роли, сильные стороны и направления развития.",
  },
  {
    id: "theses",
    label: "Тезисы",
    description: "Ключевые мысли, гипотезы и формулировки, к которым важно возвращаться.",
  },
  {
    id: "principles",
    label: "Принципы",
    description: "Личные правила, на которые вы опираетесь в решениях и поступках.",
  },
];

export const CAREER_TABS = [
  {
    id: "about",
    label: "О себе",
    description: "Профессиональный профиль, принципы работы и взгляд на финтех-продукты.",
  },
  {
    id: "domain",
    label: "Домен",
    description: "Профессиональная область, её границы, ключевые игроки и направления влияния.",
  },
  {
    id: "cv",
    label: "CV",
    description: "Опыт, достижения и актуальная версия профессионального резюме.",
  },
  {
    id: "performance",
    label: "Перфоманс",
    description: "Цели, результаты и обратная связь по вашей текущей профессиональной роли.",
    layout: "full-width",
  },
  {
    id: "development-plan",
    label: "ИПР",
    description: "Индивидуальный план развития: навыки, действия и контрольные точки.",
  },
  { id: "contacts", label: "Контакты" },
];

export const EDUCATION_TABS = [
  {
    id: "courses",
    label: "Курсы",
    description: "Пройденные и запланированные программы обучения, материалы и результаты.",
  },
  {
    id: "conferences",
    label: "Конференции",
    description: "Профессиональные конференции, выступления и полезные контакты с мероприятий.",
  },
  {
    id: "coaching",
    label: "Коучинг",
    description: "Цели, сессии и договорённости в рамках индивидуальной работы с коучем.",
  },
];

export const HEALTH_TABS = [
  {
    id: "lab-results",
    label: "Анализы",
    description: "Результаты обследований, динамика показателей и рекомендации специалистов.",
  },
  {
    id: "sport",
    label: "Спорт",
    description: "Тренировочные планы, активность, достижения и восстановление.",
  },
  {
    id: "medications",
    label: "Препараты",
    description: "Назначенные препараты, схемы приёма и важные напоминания.",
  },
  { id: "sleep", label: "Сон", description: "Дневник сна, длительность и качество отдыха." },
  { id: "nutrition", label: "Питание", description: "Дневник питания, калории и БЖУ за день." },
];

export const SPHERE_TABS = {
  identity: IDENTITY_TABS,
  health: HEALTH_TABS,
  education: EDUCATION_TABS,
  career: CAREER_TABS,
};
