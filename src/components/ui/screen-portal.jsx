import { createPortal } from "react-dom";

// Render a route's content in its normal document-flow host, preserving the
// source form's React contexts. This primitive does not create an overlay.
export function ScreenPortal({ container, children }) {
  return container ? createPortal(children, container) : null;
}
