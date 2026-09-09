import assert from "node:assert/strict";

// Scan every application JSX source, including lazy pages and editor modules.
// NativeSelect is an official component, but Rollapp uses Select consistently.
export function checkUiComposition(source, file) {
  assert.doesNotMatch(source, /--drawer-content-width/, `${file}: choose a shared app-drawer size role instead of a one-off width`);
  assert.doesNotMatch(source, /components\/ui\/native-select|<NativeSelect\b/, `${file}: use shadcn Select, not the browser's native select menu`);
  assert.doesNotMatch(source, /<(?:button|select|option|optgroup|textarea|dialog|details|summary)\b/, `${file}: interactive controls must compose shadcn primitives`);
  assert.doesNotMatch(source, /\brole\s*=\s*(?:["'](?:dialog|alertdialog|menu|menuitem|menuitemcheckbox|listbox|combobox|switch|tab)["']|\{[^}]*["'](?:dialog|alertdialog|menu|menuitem|menuitemcheckbox|listbox|combobox|switch|tab)["'])/, `${file}: dialog, menu and selection semantics must come from the shared primitive`);
  assert.doesNotMatch(source, /createPortal|(?:window|globalThis)\.(?:alert|confirm|prompt)\s*\(/, `${file}: use the shared Dialog, AlertDialog or portal component`);

  for (const [tag] of source.matchAll(/<TabsList\b[\s\S]*?>/g)) {
    assert.doesNotMatch(tag, /\b(?:overflow(?:-[xy])?-(?:auto|scroll)|flex-nowrap)\b/, `${file}: tab navigation must wrap without a nested scrollbar`);
  }

  for (const [tag] of source.matchAll(/<input\b[\s\S]*?\/>/g)) {
    // File handles have a visible shadcn Button. GFM task markers are immutable
    // document content and deliberately follow the shadcn Typeset contract.
    const hiddenFile = /type=["']file["']/.test(tag) && /className=["'][^"']*\bsr-only\b/.test(tag);
    const documentTask = file === "src/components/life-strategy.jsx"
      && /type=["']checkbox["']/.test(tag)
      && /\bdisabled\b/.test(tag) && /\breadOnly\b/.test(tag)
      && /aria-labelledby=/.test(tag);
    assert(hiddenFile || documentTask, `${file}: visible inputs must use shadcn Input/Checkbox`);
  }
}
