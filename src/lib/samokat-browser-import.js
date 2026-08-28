import {
  normalizeRetailerBrowserMetadata,
  requestRetailerBrowserMetadata,
  RetailerBrowserImportError,
} from "./retailer-browser-import.js";

export class SamokatBrowserImportError extends RetailerBrowserImportError {
  constructor(message, code) {
    super(message, code);
    this.name = "SamokatBrowserImportError";
  }
}

export function normalizeSamokatBrowserMetadata(value) {
  try {
    return normalizeRetailerBrowserMetadata("samokat", value);
  } catch (error) {
    if (error instanceof RetailerBrowserImportError) throw new SamokatBrowserImportError(error.message, error.code);
    throw error;
  }
}

export async function requestSamokatBrowserMetadata(url, {
  target = typeof window === "undefined" ? null : window,
  pingTimeoutMs = 700,
  importTimeoutMs = 28_000,
} = {}) {
  try {
    return await requestRetailerBrowserMetadata("samokat", url, { target, pingTimeoutMs, importTimeoutMs });
  } catch (error) {
    if (error instanceof RetailerBrowserImportError) throw new SamokatBrowserImportError(error.message, error.code);
    throw error;
  }
}
