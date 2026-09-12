# Rollapp typography

`src/index.css` and `src/typeset.css` are the implementation source of truth for typography.

## Primary text

- Family: `Geist Variable` through `--font-sans` and `--font-body`.
- Size: `1.125rem` (`18px`).
- Line height: `1.75rem` (`28px`).
- Weight: `400`.
- Style: normal.
- Tracking: `0`.
- Color: `--foreground`.
- Viewports: the same `18px/28px` baseline applies on desktop and mobile.

Use `--text-rollapp-body` and `--text-rollapp-body--line-height`; do not repeat numeric body sizes in components. Readable documents use `typeset typeset-rollapp`. Application and portalled surfaces use `rollapp-body`.

## Semantic exceptions

Headings use the semantic scale in `src/typeset.css`. Captions and secondary microcopy use the shared `--text-xs` role. Primary controls and menu or select rows use the primary `18px/28px` text with the product Large geometry defined in `src/index.css`.
