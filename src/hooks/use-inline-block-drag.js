import { useEffect, useRef } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { BlockSelection, blockRange, containsSelectedBlock } from "@/lib/inline-block-selection";
import { selectedBlockPosition, selectedBlockRange } from "@/lib/inline-blocks";
import { blockRelocationPlan, blockRelocationTransaction } from "@/lib/inline-block-move";

// Internal drags move actual logical nodes, like the keyboard commands. Native
// HTML fitting can unwrap a list item or lose its container colour. Foreign
// HTML/text drops keep the editor's ordinary paste/drop path.
export function useInlineBlockDrag(editor, hovered) {
  const result = useRef(null);
  useEffect(() => {
    let handle = null, bindFrame = 0, scrollFrame = 0, active = null, ownedDrag = false;
    const finish = () => {
      if (!active) return;
      if (result.current !== "moved") result.current = "cancelled";
      active.preview.remove(); active.guide.remove();
      if (handle) handle.dataset.dragging = "false";
      cancelAnimationFrame(scrollFrame); scrollFrame = 0;
      if (!editor.isDestroyed && editor.view.dragging === active.dragging) editor.view.dragging = null;
      active = null;
    };
    const candidate = point => {
      if (!active || editor.isDestroyed || !editor.isEditable || editor.state.doc !== active.doc) return null;
      const { view, state } = editor, bounds = view.dom.getBoundingClientRect();
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return null;
      const hit = view.posAtCoords({ left: point.x, top: point.y });
      if (!hit) return null;
      const position = selectedBlockPosition({ $from: state.doc.resolve(hit.pos) });
      const node = state.doc.nodeAt(position), element = view.nodeDOM(position);
      if (!node || node.type.spec.selectable === false || !(element instanceof HTMLElement)) return null;
      if (active.selection.positions.some(source => position >= source && position < source + state.doc.nodeAt(source).nodeSize)) return null;
      const box = element.getBoundingClientRect();
      const ownLine = ["nestedBlock", "listItem", "taskItem", "blockquote", "details"].includes(node.type.name) ? element.querySelector("p,h1,h2,h3,h4,h5,h6,summary") : null;
      const line = ownLine?.getBoundingClientRect() || box;
      const middle = point.y > line.top + Math.min(8, line.height / 4) && point.y < line.bottom - Math.min(8, line.height / 4);
      const edge = Math.min(24, box.width / 4);
      const side = middle && point.x < box.left + edge ? "left" : middle && point.x > box.right - edge ? "right" : point.y < (line.top + line.bottom) / 2 ? "before" : "after";
      // A guide promises a valid move. Check structural/reload constraints once
      // per logical target; geometry can still follow scrolling every frame.
      const key = `${position}:${side}`;
      if (active.candidateKey !== key) {
        active.candidateKey = key;
        const range = selectedBlockRange(state.doc, active.selection.headBlock, active.selection);
        active.candidateAllowed = Boolean(blockRelocationPlan(state.doc, range, position, side));
      }
      if (!active.candidateAllowed) return null;
      const horizontal = ["left", "right"].includes(side);
      return { position, side, left: side === "right" ? box.right : box.left, top: horizontal || side === "before" ? box.top : box.bottom, width: horizontal ? 2 : box.width, height: horizontal ? box.height : 2 };
    };
    const showGuide = () => {
      const target = active?.point && candidate(active.point);
      if (!active) return;
      active.guide.hidden = !target;
      if (target) Object.assign(active.guide.style, { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px` });
    };
    const scroll = () => {
      if (!active || editor.isDestroyed || !editor.isEditable || editor.state.doc !== active.doc) { finish(); return; }
      const viewport = window.visualViewport, top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight), edge = 48;
      const y = active.point?.y;
      const delta = y < top + edge ? -Math.min(16, (top + edge - y) / 3) : y > bottom - edge ? Math.min(16, (y - bottom + edge) / 3) : 0;
      if (delta) { window.scrollBy({ top: delta, behavior: "instant" }); showGuide(); }
      scrollFrame = requestAnimationFrame(scroll);
    };
    const start = event => {
      if (!editor.isEditable || editor.view.composing || event.isComposing || !Number.isInteger(hovered.current) || !event.dataTransfer) return;
      const range = blockRange(editor.state.doc, hovered.current);
      if (!range) return;
      event.stopImmediatePropagation(); finish();
      if (!containsSelectedBlock(editor.state.selection, hovered.current)) editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, range.from)));
      const selection = editor.state.selection;
      editor.view.dispatch(closeHistory(editor.state.tr));
      const slice = selection.content(), serialized = editor.view.serializeForClipboard(slice);
      const preview = document.createElement("div"), guide = document.createElement("div");
      preview.className = "inline-editor__drag-preview typeset typeset-rollapp";
      preview.style.width = `${editor.view.dom.getBoundingClientRect().width}px`;
      preview.append(...Array.from(serialized.dom.childNodes).map(node => node.cloneNode(true)));
      guide.className = "inline-editor__drop-guide not-typeset"; guide.hidden = true; guide.setAttribute("aria-hidden", "true");
      document.body.append(preview, guide);
      event.dataTransfer.clearData();
      event.dataTransfer.setData("text/html", serialized.dom.innerHTML);
      event.dataTransfer.setData("text/plain", serialized.text);
      event.dataTransfer.effectAllowed = "copyMove"; event.dataTransfer.setDragImage(preview, 0, 0);
      const dragging = { slice, move: true };
      editor.view.dragging = dragging; handle.dataset.dragging = "true";
      ownedDrag = true; result.current = null;
      active = { doc: editor.state.doc, selection, dragging, preview, guide, point: null };
      scrollFrame = requestAnimationFrame(scroll);
    };
    const dragover = event => {
      if (!active) return;
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== active.doc) { finish(); return; }
      if (!editor.view.dom.contains(event.target)) { active.guide.hidden = true; active.point = null; return; }
      event.preventDefault(); event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      active.point = { x: event.clientX, y: event.clientY }; showGuide();
    };
    const drop = event => {
      // A stale/cancelled internal gesture must not fall back to an HTML copy
      // when its source changes while the browser still holds the mouse down.
      if (!active) { if (ownedDrag) { event.preventDefault(); event.stopPropagation(); ownedDrag = false; } return; }
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== active.doc) { event.preventDefault(); event.stopPropagation(); finish(); ownedDrag = false; return; }
      if (!editor.view.dom.contains(event.target)) { finish(); ownedDrag = false; return; }
      event.preventDefault(); event.stopPropagation();
      const target = candidate({ x: event.clientX, y: event.clientY });
      const range = selectedBlockRange(editor.state.doc, active.selection.headBlock, active.selection);
      const tr = target && blockRelocationTransaction(editor.state, range, target.position, target.side);
      // Finish browser drag ownership before projecting the new block selection.
      finish();
      if (tr) {
        editor.view.dispatch(closeHistory(tr).scrollIntoView());
        editor.view.dispatch(closeHistory(editor.state.tr));
        editor.view.focus(); result.current = "moved";
      }
      ownedDrag = false;
    };
    const end = () => { finish(); ownedDrag = false; };
    const bind = () => {
      if (editor.isDestroyed) return;
      if (editor.isInitialized) handle = editor.view.dom.parentElement?.querySelector(".inline-editor__drag-handle");
      if (handle) handle.addEventListener("dragstart", start, true);
      else bindFrame = requestAnimationFrame(bind);
    };
    bindFrame = requestAnimationFrame(bind);
    document.addEventListener("dragover", dragover, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("dragend", end, true);
    return () => {
      cancelAnimationFrame(bindFrame); finish(); handle?.removeEventListener("dragstart", start, true);
      document.removeEventListener("dragover", dragover, true);
      document.removeEventListener("drop", drop, true);
      document.removeEventListener("dragend", end, true);
    };
  }, [editor, hovered]);
  return result;
}
