export const PERSONAL_CHARACTER_TRAIT_GROUPS = [
  {
    id: "thinking",
    label: "Мышление и самостоятельность",
    traits: [
      { id: "curiosity", label: "Любознательность", description: "Стремление разбираться в новом и задавать вопросы." },
      { id: "critical-thinking", label: "Критическое мышление", description: "Проверять идеи, факты и выводы перед тем, как на них опираться." },
      { id: "systems-thinking", label: "Системность", description: "Видеть связи, причины и последствия в сложных ситуациях." },
      { id: "reflection", label: "Рефлексивность", description: "Замечать свои реакции и извлекать опыт из событий." },
      { id: "independence", label: "Самостоятельность", description: "Принимать решения, опираясь на собственное суждение." },
      { id: "decisiveness", label: "Решительность", description: "Выбирать направление и действовать, когда данных недостаточно." },
      { id: "creativity", label: "Креативность", description: "Находить свежие сочетания идей и нестандартные решения." },
    ],
  },
  {
    id: "action",
    label: "Действие и результат",
    traits: [
      { id: "initiative", label: "Инициативность", description: "Самому замечать возможности и начинать действовать." },
      { id: "purposefulness", label: "Целеустремлённость", description: "Сохранять фокус на важной цели, несмотря на препятствия." },
      { id: "discipline", label: "Дисциплина", description: "Делать нужное регулярно, а не только по настроению." },
      { id: "responsibility", label: "Ответственность", description: "Доводить обязательства до результата и признавать свою роль." },
      { id: "organization", label: "Организованность", description: "Выстраивать порядок в задачах, времени и договорённостях." },
      { id: "attention-to-detail", label: "Внимательность к деталям", description: "Замечать нюансы, которые влияют на качество результата." },
      { id: "courage", label: "Смелость", description: "Действовать, даже когда есть риск ошибки или оценки со стороны." },
    ],
  },
  {
    id: "resilience",
    label: "Устойчивость и саморегуляция",
    traits: [
      { id: "emotional-resilience", label: "Эмоциональная устойчивость", description: "Сохранять опору и ясность в напряжённых обстоятельствах." },
      { id: "flexibility", label: "Гибкость", description: "Перестраивать подход, когда меняется контекст." },
      { id: "patience", label: "Терпение", description: "Спокойно выдерживать путь к результату, который требует времени." },
      { id: "self-control", label: "Самоконтроль", description: "Управлять импульсами и выбирать осознанную реакцию." },
      { id: "optimism", label: "Оптимизм", description: "Сохранять веру в возможность хорошего исхода и искать следующий шаг." },
      { id: "confidence", label: "Уверенность", description: "Действовать, доверяя своим знаниям и способности справиться." },
      { id: "adaptability", label: "Адаптивность", description: "Быстро осваиваться в новых ролях, условиях и правилах." },
    ],
  },
  {
    id: "relationships",
    label: "Отношения и взаимодействие",
    traits: [
      { id: "empathy", label: "Эмпатия", description: "Понимать чувства и перспективу другого человека." },
      { id: "openness", label: "Открытость", description: "Готовность честно говорить о себе и слышать обратную связь." },
      { id: "tact", label: "Тактичность", description: "Учитывать границы и подбирать бережный способ общения." },
      { id: "cooperation", label: "Умение сотрудничать", description: "Искать общий результат и строить работу вместе с другими." },
      { id: "assertiveness", label: "Ассертивность", description: "Ясно отстаивать свои интересы, уважая интересы других." },
      { id: "reliability", label: "Надёжность", description: "Быть человеком, на которого можно положиться." },
      { id: "generosity", label: "Щедрость", description: "Делиться временем, знаниями и вниманием без мелочности." },
    ],
  },
];

export const PERSONAL_CHARACTER_TRAITS = PERSONAL_CHARACTER_TRAIT_GROUPS.flatMap((group) => (
  group.traits.map((trait) => ({ ...trait, groupId: group.id, groupLabel: group.label }))
));

export const PERSONAL_CHARACTER_TRAIT_IDS = new Set(PERSONAL_CHARACTER_TRAITS.map((trait) => trait.id));
