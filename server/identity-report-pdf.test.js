import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateIdentityReport, identityReportForDisplay, parseIdentityPdf } from "./identity-report-pdf.js";

test("generateIdentityReport merges Gallup talents by rank across documents", () => {
  const report = generateIdentityReport("gallup", [
    {
      id: "top", filename: "top.pdf", uploadedAt: "2026-08-31T10:00:00.000Z",
      person: "Mikhail Koloskov", date: "2023-05-19", sections: [],
      strengths: [
        { rank: 1, name: "Learner", translation: "Обучаемость", domain: "strategic" },
        { rank: 2, name: "Self-Assurance", translation: "Уверенность", domain: "influencing" },
      ],
    },
    {
      id: "full", filename: "full.pdf", uploadedAt: "2026-08-31T11:00:00.000Z",
      sections: [],
      strengths: [{ rank: 3, name: "Achiever", translation: "Достижение", domain: "executing" }],
    },
  ]);
  assert.equal(report.person, "Mikhail Koloskov");
  assert.deepEqual(report.strengths.map((item) => item.rank), [1, 2, 3]);
  assert.equal(report.documents.length, 2);
});

test("generateIdentityReport combines Hogan scales without losing profiles", () => {
  const report = generateIdentityReport("hogan", [
    {
      id: "hpi", filename: "hpi.pdf", uploadedAt: "2026-08-31T10:00:00.000Z", sections: [],
      profiles: [{ id: "hpi", scores: [["Амбициозность", 84, ""]] }],
    },
    {
      id: "hds", filename: "hds.pdf", uploadedAt: "2026-08-31T11:00:00.000Z", sections: [],
      profiles: [{ id: "hds", scores: [["Скептичный", 90, ""]] }],
    },
  ]);
  assert.deepEqual(report.profiles.map((profile) => profile.id), ["hpi", "hds"]);
  assert.equal(report.profiles[0].scores[0][1], 84);
  assert.equal("sections" in report.documents[0], false);
});

test("identityReportForDisplay removes legacy raw Hogan sections without losing structured data", () => {
  const report = identityReportForDisplay("hogan", {
    section: "hogan",
    profiles: [{ id: "hpi", scores: [["Амбициозность", 84, ""]] }],
    documents: [{
      id: "summary",
      filename: "summary.pdf",
      sections: [{ title: "Сильные стороны", paragraphs: ["Сырой текст PDF"] }],
      profiles: [{ id: "hpi", scores: [["Амбициозность", 84, ""]] }],
    }],
  });

  assert.equal("sections" in report.documents[0], false);
  assert.equal(report.documents[0].filename, "summary.pdf");
  assert.equal(report.profiles[0].scores[0][1], 84);
});

test("identityReportForDisplay preserves Gallup document sections", () => {
  const report = {
    section: "gallup",
    documents: [{ id: "full", sections: [{ title: "Таланты", paragraphs: ["Текст"] }] }],
  };

  assert.equal(identityReportForDisplay("gallup", report), report);
});

test("parseIdentityPdf restores all 34 ranks from the bundled Gallup report", async () => {
  const buffer = await readFile(new URL("../src/assets/gallup/cliftonstrengths-34.pdf", import.meta.url));
  const document = await parseIdentityPdf(buffer, {
    section: "gallup",
    id: "full-profile",
    filename: "cliftonstrengths-34.pdf",
    uploadedAt: new Date("2026-08-31T12:00:00.000Z"),
  });
  assert.equal(document.strengths.length, 34);
  assert.deepEqual(document.strengths.slice(0, 3).map((strength) => strength.name), [
    "Learner", "Self-Assurance", "Achiever",
  ]);
  assert.equal(document.date, "2023-05-19");
});
