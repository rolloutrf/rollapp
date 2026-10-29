// Entirely generated fixtures: no personal report bytes or participant results.
export const SYNTHETIC_TALENTS = ["Achiever", "Activator", "Adaptability", "Analytical", "Arranger", "Belief", "Command", "Communication", "Competition", "Connectedness", "Consistency", "Context", "Deliberative", "Developer", "Discipline", "Empathy", "Focus", "Futuristic", "Harmony", "Ideation", "Includer", "Individualization", "Input", "Intellection", "Learner", "Maximizer", "Positivity", "Relator", "Responsibility", "Restorative", "Self-Assurance", "Significance", "Strategic", "Woo"];

export function syntheticPdf(pages) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const firstFont = 3 + pages.length * 2;
  const kids = [];
  for (const page of pages) {
    const pageId = objects.length + 1;
    kids.push(`${pageId} 0 R`);
    const stream = [
      ...(page.rectangles || []).map(rect => `${rect.color || "0.1 0.7 0.3"} rg ${rect.x} ${rect.y} ${rect.width} ${rect.height} re f`),
      ...(page.lines || []).map(line => {
        const { text, x = 40, y = 700, size = 10, font = "F1" } = typeof line === "string" ? { text: line } : line;
        const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
        return `0 0 0 rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET`;
      }),
    ].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${firstFont} 0 R /F2 ${firstFont + 1} 0 R /F3 ${firstFont + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  for (const name of ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"]) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} >>`);
  let result = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

export function syntheticGallupPdf() {
  return syntheticPdf([
    { lines: [{ text: "SYNTHETIC REPORT", size: 24, font: "F2" }, { text: "SYNTHETIC PARTICIPANT | 01.02.2030", y: 660 }, { text: "Generated alphabetic theme order; not a person's assessment.", y: 620 }] },
    { lines: SYNTHETIC_TALENTS.map((name, index) => ({ text: `${index + 1}. ${name}`, y: 740 - index * 18 })) },
    {
      lines: [
        { text: "1. Achiever", y: 700, size: 22, font: "F2" }, { text: "*", x: 152, y: 711, size: 8 },
        { text: "These synthetic insights test italic preservation.", y: 660, font: "F3" },
        ...Array.from({ length: 5 }, (_, index) => [{ text: `Synthetic emphasis ${index + 1} retains this entire sentence.`, x: 55, y: 590 - index * 90 }, { text: "This paragraph has no participant-specific content.", x: 55, y: 574 - index * 90 }]).flat(),
        { text: "1. Synthetic list item", y: 90 }, { text: "2. Another synthetic list item", y: 74 },
      ],
      rectangles: [
        ...Array.from({ length: 34 }, (_, index) => ({ x: 40 + index * 5, y: 730, width: 4, height: 30 })),
        ...Array.from({ length: 5 }, (_, index) => ({ x: 40, y: 555 - index * 90, width: 3, height: 55 })),
      ],
    },
  ]);
}
