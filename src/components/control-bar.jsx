// Product navigation sizing lives in spacing.css, independent of the viewport,
// primitive defaults, local utility classes, and the toolbar's scroll position.
export function ControlBar({ as: Component = "div", role, ...props }) {
  const namedGroup = Component === "div" && (props["aria-label"] || props["aria-labelledby"]);
  return <Component role={role ?? (namedGroup ? "group" : undefined)} {...props} data-control-bar="" />;
}
