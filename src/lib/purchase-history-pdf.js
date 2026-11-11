import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PURCHASE_HISTORY_MAX_CHARS } from "../../shared/purchase-history.js";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPurchaseHistoryPdf(file) {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useWasm: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const timer = setTimeout(() => { void task.destroy().catch(() => {}); }, 20_000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 40) throw new Error("В PDF больше 40 страниц. Скачайте операции за более короткий период.");
    let result = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const fragments = items.filter((item) => item.str?.trim())
        .sort((a, b) => b.transform[5] - a.transform[5]);
      const lines = [];
      for (const fragment of fragments) {
        const y = fragment.transform[5];
        const last = lines.at(-1);
        if (last && Math.abs(last.y - y) <= 2) last.fragments.push(fragment);
        else lines.push({ y, fragments: [fragment] });
      }
      result += lines.map(({ fragments: row }) => row.sort((a, b) => a.transform[4] - b.transform[4])
        .map(({ str }) => str.trim()).join(" ")).join("\n") + "\n";
      if (result.length > PURCHASE_HISTORY_MAX_CHARS) throw new Error("В PDF слишком много текста. Скачайте операции за более короткий период.");
      page.cleanup();
    }
    if (!result.trim()) throw new Error("В PDF нет текстового слоя. Выгрузите операции таблицей или выберите текстовый PDF.");
    return result;
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("Снимите пароль с PDF и выберите файл снова.");
    if (["InvalidPDFException", "FormatError", "UnknownErrorException", "AbortException"].includes(error?.name)) {
      throw new Error("Не удалось прочитать PDF. Попробуйте выгрузку CSV или XLSX.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => {});
  }
}
