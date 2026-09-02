export const EMPTY_CV = Object.freeze({
  version: 1,
  desiredPosition: "",
  specialization: "",
  city: "",
  salary: "",
  employment: "Полная занятость",
  schedule: "Полный день",
  about: "",
  skills: [],
  experiences: [],
  education: [],
  legacyMarkdown: "",
});

function cleanText(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeCvContent(content, fallbackMarkdown = "") {
  if (typeof content === "string") {
    return { ...EMPTY_CV, legacyMarkdown: content };
  }

  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { ...EMPTY_CV, legacyMarkdown: cleanText(fallbackMarkdown) };
  }

  return {
    ...EMPTY_CV,
    desiredPosition: cleanText(content.desiredPosition),
    specialization: cleanText(content.specialization),
    city: cleanText(content.city),
    salary: cleanText(content.salary),
    employment: cleanText(content.employment) || EMPTY_CV.employment,
    schedule: cleanText(content.schedule) || EMPTY_CV.schedule,
    about: cleanText(content.about),
    skills: Array.isArray(content.skills) ? content.skills.filter((skill) => typeof skill === "string" && skill.trim()) : [],
    experiences: Array.isArray(content.experiences) ? content.experiences.map((experience, index) => ({
      id: cleanText(experience?.id) || `experience-${index + 1}`,
      company: cleanText(experience?.company),
      position: cleanText(experience?.position),
      startDate: cleanText(experience?.startDate),
      endDate: cleanText(experience?.endDate),
      current: Boolean(experience?.current),
      description: cleanText(experience?.description),
    })) : [],
    education: Array.isArray(content.education) ? content.education.map((education, index) => ({
      id: cleanText(education?.id) || `education-${index + 1}`,
      institution: cleanText(education?.institution),
      faculty: cleanText(education?.faculty),
      specialization: cleanText(education?.specialization),
      graduationYear: cleanText(education?.graduationYear),
    })) : [],
    legacyMarkdown: cleanText(content.legacyMarkdown),
  };
}

export function cvHasStructuredContent(cv) {
  return Boolean(
    cv.desiredPosition
    || cv.specialization
    || cv.city
    || cv.salary
    || cv.about
    || cv.skills.length
    || cv.experiences.length
    || cv.education.length,
  );
}
