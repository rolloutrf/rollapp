// Public retailer-rendering facade. The implementation remains in the original
// Samokat module so existing imports stay compatible while Lenta shares the
// same browser process, queue, deadlines and network isolation.
export {
  canonicalSamokatProductUrl,
  isAllowedSamokatBrowserUrl,
  isInteractiveSamokatChallenge,
  isRetailerProductDocument,
  isSamokatProductHead,
  renderLentaProductHtml,
  renderRetailerProductHtml,
  renderSamokatProductHtml,
} from "./samokat-renderer.js";
