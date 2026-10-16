// Product navigation sizing lives in spacing.css, independent of the viewport,
// primitive defaults, local utility classes, and the toolbar's scroll position.
export function ControlBar({ as: Component = "div", ...props }) {
  return <Component {...props} data-control-bar="" />;
}
