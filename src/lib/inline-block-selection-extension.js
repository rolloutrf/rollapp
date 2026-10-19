import { currentBlockAction } from "./inline-current-block-action.js";
import { changeBlockDepth } from "./inline-block-tree.js";
import { Extension } from "@tiptap/core";
import { AllSelection, Plugin, Selection, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory, undo } from "@tiptap/pm/history";
import { BlockSelection, blockRange, blockSelectionBetween, isBlockSelection, normalizeBlockPositions, prepareBlockComposition } from "./inline-block-selection.js";
import { changeTextBlock, insertTextBlock, selectedBlockPosition } from "./inline-blocks.js";

function selectBlocks(editor, anchor, head = anchor) {
  const selection = blockSelectionBetween(editor.state.doc, anchor, head);
  if (!selection) return false;
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

export function toggleBlockSelection(editor, position) {
  if (!editor.isEditable || !blockRange(editor.state.doc, position)) return false;
  const { doc, selection } = editor.state;
  let positions = isBlockSelection(selection) ? [...selection.positions] : [];
  const containing = positions.find(pos => position >= pos && position < pos + doc.nodeAt(pos).nodeSize);
  positions = containing == null ? normalizeBlockPositions(doc, [...positions, position]) : positions.filter(pos => pos !== containing);
  const next = positions.length ? BlockSelection.fromPositions(doc, positions, isBlockSelection(selection) ? selection.anchorBlock : position, positions.includes(position) ? position : positions.at(-1)) : Selection.near(doc.resolve(position + 1));
  editor.view.dispatch(editor.state.tr.setSelection(next));
  editor.view.focus?.();
  return true;
}

export function blockToggleModifier(event, platform = globalThis.navigator?.platform || "") {
  return event.shiftKey && (/Mac|iPhone|iPad/.test(platform) ? event.metaKey && !event.ctrlKey && !event.altKey : event.altKey && !event.metaKey && !event.ctrlKey);
}

// Browsers normalize node-boundary DOM ranges to the first/last text cursor.
// That is the projection of our block selection, not a new text selection.
export function projectedBlockSelection(view, $anchor, $head) {
  const selection = view.state.selection;
  if (!isBlockSelection(selection)) return null;
  const forward = selection.anchor <= selection.head;
  const matches = (actual, boundary, block, direction) => {
    if (actual.pos === boundary.pos) return true;
    const cursor = Selection.findFrom(boundary, direction, true)?.head;
    return cursor != null && cursor >= block && cursor <= block + view.state.doc.nodeAt(block).nodeSize && actual.pos === cursor;
  };
  return matches($anchor, selection.$anchor, selection.anchorBlock, forward ? 1 : -1)
    && matches($head, selection.$head, selection.headBlock, forward ? -1 : 1) ? selection : null;
}

export function handleBlockKeyDown(editor, event) {
  if (!editor.isEditable || event.isComposing || editor.view.composing) return false;
  const { selection, doc } = editor.state;
  const blocks = isBlockSelection(selection);
  const mod = event.metaKey || event.ctrlKey;
  if (mod && !event.altKey && !event.shiftKey && event.key === "Enter") return currentBlockAction(editor);
  if (event.key === "Backspace" && !mod && !event.altKey && !event.shiftKey && selection.empty && selection.$from.parent.isTextblock && selection.$from.parentOffset === 0 && selection.$from.depth > 1) {
    const position = selectedBlockPosition(selection), $position = doc.resolve(position);
    if ($position.parent.type.name === "nestedBlock" && $position.index() === 1) {
      const tr = changeBlockDepth(editor.state, true);
      if (tr) { editor.view.dispatch(closeHistory(tr).scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr)); return true; }
    }
  }
  if (event.key === "Tab" && !mod && !event.altKey) {
    if (!isBlockSelection(selection)) for (let depth = selection.$from.depth; depth > 0; depth -= 1) if (["table", "codeBlock"].includes(selection.$from.node(depth).type.name)) return false;
    const tr = changeBlockDepth(editor.state, event.shiftKey);
    if (tr) { editor.view.dispatch(closeHistory(tr).scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr)); }
    return true;
  }
  if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
    if (selection instanceof AllSelection) return true;
    if (blocks) {
      if (!selectBlocks(editor, 0, doc.content.size - doc.lastChild.nodeSize)) editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(doc)));
      return true;
    }
    const { $from, $to } = selection;
    // First select the current text block; repeating selects the document.
    const current = $from.sameParent($to) && $from.parent.isTextblock;
    if (current && !$from.parent.content.size) return selectBlocks(editor, selectedBlockPosition(selection));
    const next = current && !(selection.from === $from.start() && selection.to === $from.end())
      ? TextSelection.create(doc, $from.start(), $from.end()) : new AllSelection(doc);
    editor.view.dispatch(editor.state.tr.setSelection(next));
    return true;
  }
  if (event.key === "Escape" && !mod && !event.altKey) {
    if (blocks) {
      editor.view.dispatch(editor.state.tr.setSelection(Selection.near(doc.resolve(selection.headBlock + 1))));
      return true;
    }
    const first = selectedBlockPosition({ $from: selection.$from });
    let end = selection.$to;
    // Native selection can end just inside an untouched paragraph (after its
    // opening token), including the first paragraph of a nested list/toggle.
    if (!selection.empty && end.parent.isTextblock && end.parentOffset === 0) {
      let boundary = doc.resolve(end.before());
      while (boundary.depth && boundary.parentOffset === 0) boundary = doc.resolve(boundary.before());
      end = doc.resolve(Math.max(selection.from, boundary.pos - 1));
      // The preceding answer ends inside its protected wrapper. Choose its
      // last block, not the wrapper or the untouched next answer.
      if (end.parent.type.spec.selectable === false && end.nodeBefore?.isBlock) {
        end = doc.resolve(end.pos - end.nodeBefore.nodeSize + (end.nodeBefore.isLeaf ? 0 : 1));
      }
    } else if (!selection.empty) end = doc.resolve(selection.to - 1);
    const last = selectedBlockPosition({ $from: end });
    return selection.anchor <= selection.head ? selectBlocks(editor, first, last) : selectBlocks(editor, last, first);
  }
  if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "d") return changeTextBlock(editor, selectedBlockPosition(selection), "duplicate");
  if (!blocks || mod || event.altKey) return false;
  if (["ArrowUp", "ArrowDown"].includes(event.key)) {
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const $head = doc.resolve(selection.headBlock), index = $head.index() + direction;
    if (index < 0 || index >= $head.parent.childCount) return true;
    const sibling = direction < 0 ? selection.headBlock - $head.parent.child(index).nodeSize : selection.headBlock + $head.nodeAfter.nodeSize;
    return selectBlocks(editor, event.shiftKey ? selection.anchorBlock : sibling, sibling);
  }
  if (["Backspace", "Delete"].includes(event.key)) return changeTextBlock(editor, selection.headBlock, "delete");
  if (event.key === "Enter") {
    const node = doc.nodeAt(selection.headBlock);
    const cursor = Selection.findFrom(doc.resolve(selection.headBlock), 1, true);
    if (cursor && cursor.from < selection.headBlock + node.nodeSize) {
      editor.view.dispatch(editor.state.tr.setSelection(cursor).scrollIntoView());
      return true;
    }
    return insertTextBlock(editor, selection.headBlock, "after", "paragraph");
  }
  return false;
}

export const InlineBlockSelection = Extension.create({
  name: "inlineBlockSelection",
  priority: 1100,
  addProseMirrorPlugins() {
    const editor = this.editor;
    let composition = null;
    let nativePointer = false;
    return [new Plugin({
      appendTransaction(transactions) {
        if (transactions.some(tr => tr.selectionSet && isBlockSelection(tr.selection))) nativePointer = false;
        return null;
      },
      props: {
      createSelectionBetween: (view, $anchor, $head) => nativePointer ? null : projectedBlockSelection(view, $anchor, $head),
      handleDOMEvents: { mousedown(view, event) {
        const selection = view.state.selection;
        if (!editor.isEditable || event.button !== 0 || event.isComposing || view.composing) return false;
        if (blockToggleModifier(event, view.dom.ownerDocument.defaultView.navigator.platform)) {
          const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!target || !toggleBlockSelection(editor, selectedBlockPosition({ $from: view.state.doc.resolve(target.pos) }))) { nativePointer = true; return false; }
          event.preventDefault();
          return true;
        }
        if (!event.shiftKey || !isBlockSelection(selection) || event.metaKey || event.ctrlKey || event.altKey) {
          nativePointer = true;
          // A projected endpoint can already be the browser's hidden cursor
          // after Undo. Explicit plain pointer intent must enter text even if
          // that click produces no native selectionchange (or is a double click).
          if (isBlockSelection(selection) && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (target && view.state.doc.resolve(target.pos).parent.isTextblock) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target.pos)));
          }
          return false;
        }
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!target || !selectBlocks(editor, selection.anchorBlock, selectedBlockPosition({ $from: view.state.doc.resolve(target.pos) }))) { nativePointer = true; return false; }
        event.preventDefault();
        return true;
      },
      pointerdown(_view, event) { if (event.pointerType !== "mouse") nativePointer = true; return false; },
      touchstart() { nativePointer = true; return false; },
      beforeinput(view, event) {
        if (!view.editable || view.composing || event.isComposing || !event.cancelable || !view.state.selection.disjoint) return false;
        const typing = ["insertText", "insertReplacementText"].includes(event.inputType) && typeof event.data === "string";
        if (!typing && !event.inputType?.startsWith("delete")) return false;
        const tr = closeHistory(view.state.tr);
        if (typing && event.data) tr.replaceSelectionWith(view.state.schema.text(event.data)); else tr.deleteSelection();
        event.preventDefault(); view.dispatch(tr.scrollIntoView()); if (!typing) view.dispatch(closeHistory(view.state.tr));
        return true;
      },
      compositionstart(view) {
        if (view.editable && view.state.selection.disjoint) {
          const tr = prepareBlockComposition(closeHistory(view.state.tr)).setMeta("preventUpdate", true);
          view.dispatch(tr); composition = { after: tr.doc };
        }
        return false;
      },
      compositionend(view, event) {
        if (composition && !event.data && view.state.doc.eq(composition.after)) undo(view.state, tr => view.dispatch(tr.setMeta("preventUpdate", true)));
        composition = null; return false;
      } },
      handleTextInput(view, _from, _to, text) {
        if (!view.editable || !view.state.selection.disjoint) return false;
        view.dispatch(closeHistory(view.state.tr).replaceSelectionWith(view.state.schema.text(text)).scrollIntoView());
        return true;
      },
      handleKeyDown: (_view, event) => handleBlockKeyDown(editor, event),
      handleClick(view, pos, event) {
        const selection = view.state.selection;
        if (!editor.isEditable || !event.shiftKey || !isBlockSelection(selection) || event.metaKey || event.ctrlKey || event.altKey) return false;
        return selectBlocks(editor, selection.anchorBlock, selectedBlockPosition({ $from: view.state.doc.resolve(pos) }));
      },
      decorations(state) {
        if (!isBlockSelection(state.selection)) return null;
        const decorations = [];
        for (const pos of state.selection.positions) decorations.push(Decoration.node(pos, pos + state.doc.nodeAt(pos).nodeSize, { class: "inline-editor__block-selected" }));
        return DecorationSet.create(state.doc, decorations);
      },
    } })];
  },
});
