import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("the performance page is composed from shadcn/ui without page-specific CSS", async () => {
  const [source, appSource, styles, accordion] = await Promise.all([
    readFile(new URL("src/components/performance-review.jsx", root), "utf8"),
    readFile(new URL("src/App.jsx", root), "utf8"),
    readFile(new URL("src/styles.css", root), "utf8"),
    readFile(new URL("src/components/ui/accordion.jsx", root), "utf8"),
  ]);

  for (const component of ["accordion", "alert", "avatar", "badge", "card", "separator", "tabs"]) {
    assert.match(source, new RegExp(`@/components/ui/${component}`), `PerformanceReview must use shadcn ${component}`);
  }

  assert.match(accordion, /@base-ui\/react\/accordion/, "Accordion must be the official Base UI-backed shadcn primitive");
  assert.doesNotMatch(
    source,
    /className=(?:"[^"]*performance-review|'[^']*performance-review|\{[^}]*performance-review)/su,
    "PerformanceReview must not introduce page-specific CSS hooks",
  );
  assert.doesNotMatch(source, /\bstyle=\{/, "PerformanceReview must not use inline styles");
  assert.doesNotMatch(source, /#[\da-f]{3,8}\b/iu, "PerformanceReview must use shadcn theme tokens instead of custom colors");
  assert.doesNotMatch(styles, /\.performance-review(?:__|\b)/, "Legacy CSS must not style PerformanceReview");
  assert.match(
    appSource,
    /id: "performance",[\s\S]*?layout: "full-width",/u,
    "The performance tab must opt into the full-width sphere layout",
  );
  assert.match(
    styles,
    /\.sphere-page--tabbed\.sphere-page--full-width \.tabbed-sphere \{ width: 100%; \}/u,
    "The full-width sphere layout must use the entire available content width",
  );
  assert.match(
    styles,
    /\.sphere-page--full-width \.sphere-tabs__content section \{ max-width: none; \}/u,
    "Nested performance sections must not retain the generic text-column width cap",
  );
  assert.match(
    source,
    /scroll-m-24 text-3xl leading-9 font-semibold tracking-tight/,
    "The page title must keep the shadcn docs heading scale",
  );
  assert.match(
    source,
    /<article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8/,
    "The performance page must keep its cards in a centered, readable desktop column",
  );
  assert.match(
    source,
    /className="flex flex-col gap-5 text-foreground"/,
    "Long-form review text must keep the shared Rollapp reading rhythm",
  );
  assert.doesNotMatch(source, /\bspace-[xy]-/, "shadcn compositions must use parent gap utilities instead of space-* selectors");
  assert.match(source, /<Tabs className="min-w-0 gap-6"/, "Tabs must own the gap between their list and panel");
  assert.match(
    source,
    /className="w-full max-w-full justify-start overflow-x-auto group-data-horizontal\/tabs:h-auto"/,
    "The review-cycle tab list must fill the available width and keep its narrow-screen overflow",
  );
  assert.match(source, /<TabsTrigger className="min-w-max"/, "Review-cycle tabs must share spare width without crushing their labels");
  assert.doesNotMatch(source, /<TabsTrigger className="flex-none"/, "Review-cycle tabs must not opt out of equal-width growth");
  assert.match(source, /REVIEW_SCORE_LABELS\.has\(label\)/, "Review prose must never be rendered inside a score badge");
  assert.match(source, /whitespace-nowrap text-xs font-normal text-muted-foreground/, "Feedback counts must remain readable when a project header is narrow");
  assert.match(
    source,
    /const \[actionFeedback, setActionFeedback\] = useState\(null\)/,
    "Performance actions must use one mutually exclusive success-or-error notice",
  );
  assert.doesNotMatch(source, /\b(?:importError|importNotice)\b/, "Performance actions must not leave independent stale notices on screen");
  assert.match(
    source,
    /disabled=\{careerContent\.loading \|\| importing \|\| deleting\}/,
    "Performance mutations must prevent overlapping imports and deletions",
  );
});
