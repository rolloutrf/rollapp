# Rollapp workspace instructions

## Database

- Always use the repository's configured production database for Rollapp development, previews, diagnostics, and verification.
- Never silently substitute an in-memory, demo, mock, or local database when the production database is unavailable. Report the connection problem instead.
- Connecting to the production database does not by itself authorize destructive schema changes, bulk data mutations, or data deletion. Require an explicit user request for those operations and verify the exact target first.

## Typography

- Treat `src/typeset.css` and the typography tokens in `src/index.css` as the single source of truth for Rollapp typography.
- Use `Geist Variable` (`--font-sans`) for body copy. Use `--font-heading` for headings; it currently resolves to the same family. Do not introduce another font family without an explicit design requirement.
- Wrap readable content pages in `typeset typeset-rollapp` instead of recreating heading, paragraph, list, link, caption, and vertical-rhythm styles in individual components.
- Add `typeset-document` to a nested semantic article whose sections and headers need their first text block trimmed independently of the surrounding page shell. Mark a non-semantic prose wrapper with `data-typeset-group` to trim its first block without introducing a spacer.
- Follow the shadcn/typeset rhythm contract: `--typeset-size`, `--typeset-leading`, and `--typeset-flow` are the only prose rhythm inputs. Derive heading, paragraph, list, quote, media, table, and divider spacing from them.
- Prose spacing flows in one direction. Text blocks may set `margin-block-start`; keep `margin-block-end: 0` and do not add empty spacer nodes. Avoid forward-looking `:last-child`, `:has()`, and `:empty` selectors in typography layout rules.
- A heading owns the tighter gap to the block that follows it. Do not recreate heading bottom margins or combine a preceding bottom margin with a following top margin in page CSS.
- Keep shadcn component compositions outside prose styling with `not-typeset` or `data-not-typeset`. Let the component's official padding and gap contract control its internals.
- In component compositions, use `flex`/`grid` with `gap-*` for sibling spacing; do not use `space-x-*` or `space-y-*`. Keep spacing on the parent instead of distributing margins across children.
- Keep the Rollapp content body in `Geist Variable`, regular `400`, normal style, zero tracking, and `--foreground`. Use `0.9375rem/1.640625rem` (`15px/26.25px`) on desktop and `1rem/1.75rem` (`16px/28px`) on screens up to `640px`. Paragraphs and list items use `text-wrap: pretty`.
- Apply that body contract to every non-Wishlist interface. Use `typeset typeset-rollapp` for readable content and `rollapp-body` for non-prose or portalled surfaces such as authentication, profile settings, contact details, and generic error pages.
- Wishlist pages, cards, collection views, and wish/list editors are an explicit exception: preserve their existing typography and do not add `typeset`, `typeset-rollapp`, or `rollapp-body` to their roots.
- Keep the semantic heading scale defined in `src/typeset.css`: h1 `2.25rem/2.5rem`, h2 `1.875rem/2.25rem`, h3 `1.5rem/2rem`, h4 `1.25rem/1.75rem`, h5 `1.125rem/1.75rem`, and h6 `1rem/1.5rem`.
- Use the shared caption token (`0.8125rem/1rem`) for captions and secondary microcopy. Use the shared uppercase label treatment (`0.8125rem/1rem`, weight `600`, tracking `0.08em`) for eyebrows and section labels.
- Preserve the product-level Large control contract in `src/index.css`: primary application controls and menu/select rows use at least `1rem/1.5rem` type and `3rem` minimum block size. Keep upstream shadcn primitives at their official Base Nova defaults and apply product sizing in the composition/global product layer.
- Prefer semantic HTML and the shared typography preset or Tailwind theme tokens over arbitrary values such as `text-[…]`, local `font-size`, or local `line-height` declarations.
- Do not add a new one-off type size merely to match a single screen. Reuse the closest semantic role; if a genuinely new role is needed, add and document it in the shared typography source first.
- Component-specific overrides are allowed only when the content has a distinct semantic role or a verified responsive constraint. Keep the exception local and avoid changing the global scale to fix one component.
- When changing shared typography, verify both desktop and mobile layouts and run the relevant UI checks, including `scripts/check-shadcn.mjs` and affected visual smoke coverage.
