import { parseBankHistory, parsePurchaseHistory } from "../../shared/purchase-history.js";

const FILE_LIMIT = 5 * 1024 * 1024;

function readXlsx(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./purchase-history-xlsx-worker.js", import.meta.url), { type: "module" });
    const finish = (error, parsed) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(parsed);
    };
    const timer = setTimeout(() => finish("Таблица читается слишком долго. Скачайте операции за более короткий период."), 15_000);
    worker.onmessage = ({ data }) => finish(data.error, data.parsed);
    worker.onerror = () => finish("Не удалось прочитать таблицу XLSX. Попробуйте выгрузку CSV.");
    worker.postMessage(file);
  });
}

export async function parsePurchaseHistoryFile(file, source) {
  if (!file.size) throw new Error("Файл пуст.");
  if (file.size > FILE_LIMIT) throw new Error("Выберите файл размером до 5 МБ.");
  const format = file.name.split(".").at(-1).toLowerCase();
  const bank = source === "bank";
  if (bank && format === "xlsx") return readXlsx(file);
  const allowed = bank ? ["csv", "tsv", "pdf"] : ["csv", "tsv", "txt", "json", "pdf"];
  if (!allowed.includes(format)) throw new Error(bank
    ? "Выберите файл CSV, XLSX, TSV или PDF."
    : "Выберите файл TXT, CSV, TSV, JSON или PDF.");

  let value;
  if (format === "pdf") {
    const { readPurchaseHistoryPdf } = await import("./purchase-history-pdf.js");
    value = await readPurchaseHistoryPdf(file);
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xfe) value = new TextDecoder("utf-16le").decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) value = new TextDecoder("utf-16be").decode(bytes);
    else {
      try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { value = new TextDecoder("windows-1251").decode(bytes); }
    }
  }
  return bank ? parseBankHistory(value, format) : parsePurchaseHistory(value, format);
}
