import readExcelFile from "read-excel-file/universal";
import { parseBankHistoryRows } from "../../shared/purchase-history.js";

self.onmessage = async ({ data: file }) => {
  try {
    const sheets = await readExcelFile(file);
    for (const sheet of sheets) {
      const parsed = parseBankHistoryRows(sheet.data);
      if (parsed) {
        self.postMessage({ parsed });
        return;
      }
    }
    self.postMessage({ error: "Не удалось найти колонки даты, суммы и описания. Выберите экспорт из раздела «Операции» Т-Банка." });
  } catch (error) {
    self.postMessage({ error: error.message.startsWith("В выгрузке больше")
      ? error.message : "Не удалось прочитать таблицу XLSX. Попробуйте выгрузку CSV." });
  }
};
