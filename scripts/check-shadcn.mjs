import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [configText, packageText, app, agents, coachingSessionsSource, conferencesSource, coursesSource, lifeStrategySource, labResultsSource, performanceReviewSource, medicationsSource, workoutsSource, theme, typeset, legacyStyles, html, main, vite, jsconfigText] = await Promise.all([
  read("components.json"),
  read("package.json"),
  read("src/App.jsx"),
  read("AGENTS.md"),
  read("src/components/coaching-sessions.jsx"),
  read("src/components/conferences.jsx"),
  read("src/components/courses.jsx"),
  read("src/components/life-strategy.jsx"),
  read("src/components/lab-results.jsx"),
  read("src/components/performance-review.jsx"),
  read("src/components/medications.jsx"),
  read("src/components/workouts.jsx"),
  read("src/index.css"),
  read("src/typeset.css"),
  read("src/styles.css"),
  read("index.html"),
  read("src/main.jsx"),
  read("vite.config.js"),
  read("jsconfig.json"),
]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);
const jsconfig = JSON.parse(jsconfigText);

assert.equal(config.$schema, "https://ui.shadcn.com/schema.json", "components.json must use the official schema");
assert.equal(config.style, "base-nova", "shadcn style must remain base-nova");
assert.equal(config.rsc, false, "Vite components must not be generated as RSC");
assert.equal(config.tsx, false, "This JavaScript project must generate JSX components");
assert.equal(config.iconLibrary, "lucide", "shadcn components must use the configured Lucide icon library");
assert.equal(config.rtl, false, "The application is not configured for RTL output");
assert.equal(config.tailwind?.config, "", "Tailwind v4 must not point to a legacy config file");
assert.equal(config.tailwind?.baseColor, "neutral", "shadcn base color must remain neutral");
assert.equal(config.tailwind?.cssVariables, true, "shadcn CSS-variable theming must stay enabled");
assert.equal(config.tailwind?.css, "src/index.css", "components.json must point at the canonical theme");
assert.equal(config.tailwind?.prefix, "", "shadcn utility classes must not use an undeclared prefix");
assert.deepEqual(config.aliases, {
  components: "@/components",
  utils: "@/lib/utils",
  ui: "@/components/ui",
  lib: "@/lib",
  hooks: "@/hooks",
}, "shadcn aliases must stay aligned with the Vite project");

assert.match(vite, /import tailwindcss from ["']@tailwindcss\/vite["']/, "Vite must load Tailwind v4's official plugin");
assert.match(vite, /plugins:\s*\[\s*react\(\),\s*tailwindcss\(\)\s*\]/, "Tailwind must be enabled in the Vite plugin list");
assert.match(vite, /["']@["']:\s*path\.resolve\(import\.meta\.dirname,\s*["']\.\/src["']\)/, "Vite must resolve the configured @ alias");
assert.deepEqual(jsconfig.compilerOptions?.paths?.["@/*"], ["./src/*"], "jsconfig must resolve the same @ alias");

const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
for (const dependency of [
  "@base-ui/react",
  "@fontsource-variable/geist",
  "@tailwindcss/vite",
  "class-variance-authority",
  "clsx",
  "lucide-react",
  "shadcn",
  "tailwind-merge",
  "tailwindcss",
  "tw-animate-css",
]) {
  assert(dependencies[dependency], `Official shadcn dependency is missing: ${dependency}`);
}
for (const dependency of Object.keys(dependencies)) {
  assert(!dependency.startsWith("@radix-ui/"), `Base Nova must not mix in a direct Radix dependency: ${dependency}`);
}

for (const marker of [
  '@import "tailwindcss"',
  '@import "tw-animate-css"',
  '@import "shadcn/tailwind.css"',
  "@theme inline",
  ":root",
  ".dark",
  "--radius: 0.625rem",
]) {
  assert(theme.includes(marker), `Canonical shadcn theme is missing ${marker}`);
}
assert.match(theme, /--text-xs:\s*0\.8125rem;/, "The smallest shadcn text token must be 13px");
assert.match(theme, /--text-xs--line-height:\s*1rem;/, "The 13px shadcn text token must keep a compact 16px line height");
assert.match(theme, /--font-body:\s*var\(--font-sans\);/, "Rollapp body copy must use the shared sans-serif family");
assert.match(theme, /--text-rollapp-body:\s*0\.9375rem;/, "Rollapp desktop body copy must remain 15px");
assert.match(theme, /--text-rollapp-body--line-height:\s*1\.640625rem;/, "Rollapp desktop body copy must retain its 26.25px reading line height");
assert.match(typeset, /\.typeset-rollapp\s*\{[\s\S]*?--typeset-font-body:\s*var\(--font-body\);[\s\S]*?--typeset-size:\s*var\(--text-rollapp-body\);[\s\S]*?--typeset-leading:\s*var\(--text-rollapp-body--line-height\);/, "The Rollapp content preset must consume the canonical body tokens");
assert.match(typeset, /&:where\(p, li\)\s*\{[\s\S]*?font-weight:\s*400;[\s\S]*?letter-spacing:\s*0;[\s\S]*?text-wrap:\s*pretty;/, "Rollapp body copy must remain regular, untracked, and readable");
assert.match(typeset, /&:where\(h1 \+ p, h2 \+ p\)\s*\{[\s\S]*?color:\s*var\(--foreground\);/, "Rollapp lead paragraphs must use the same foreground as body copy");
assert.match(typeset, /\.not-typeset,[\s\S]*?\[data-not-typeset\]/, "Typeset must expose the official component opt-out contract");
assert.match(typeset, /&:where\(p\)\s*\{[\s\S]*?margin-block-start:\s*var\(--typeset-flow\);[\s\S]*?margin-block-end:\s*0;/, "Paragraph spacing must flow in one direction from the shared flow token");
assert.match(typeset, /&:where\(h1 \+ \*, h2 \+ \*, h3 \+ \*, h4 \+ \*, h5 \+ \*, h6 \+ \*\)\s*\{[\s\S]*?margin-block-start:\s*1em;/, "Headings must own the tighter gap to the following block");
assert.match(typeset, /&:where\(hr\)\s*\{[\s\S]*?margin-block-start:\s*calc\(var\(--typeset-flow\) \* 2\.4\);[\s\S]*?margin-block-end:\s*0;/, "Dividers must derive their one-directional spacing from the shared flow token");
assert.match(typeset, /&:where\(ul > li\)::marker,[\s\S]*?&:where\(ol > li\)::marker\s*\{[\s\S]*?color:\s*var\(--foreground\);/, "List markers must inherit the neutral prose foreground instead of introducing a blue accent");
assert.match(typeset, /&:where\(ul\.contains-task-list\)\s*\{[\s\S]*?list-style-type:\s*none;[\s\S]*?padding-inline-start:\s*0\.25em;/, "GFM task lists must use the official shadcn\/typeset layout");
assert.match(typeset, /&:where\(li\.task-list-item > input\[type="checkbox"\]\)\s*\{[\s\S]*?accent-color:\s*var\(--color-primary, currentColor\);/, "GFM task checkboxes must use the official primary theme token");
assert.doesNotMatch(typeset, /:last-child\b|:has\(|:empty\b/, "Typeset layout must remain append-stable without forward-looking selectors");
assert.doesNotMatch(lifeStrategySource, /life-strategy-source__space/, "Markdown blank lines must not render spacer elements");
assert.doesNotMatch(lifeStrategySource, /<hr\b/, "Markdown thematic breaks must not render decorative lines");
assert.match(lifeStrategySource, /<ul className=\{taskList \? "contains-task-list" : undefined\}>/, "Markdown lists must render semantic ul elements");
assert.match(lifeStrategySource, /<li className=\{taskList \? "task-list-item" : undefined\}/, "Markdown lists must render semantic li elements");
assert.doesNotMatch(lifeStrategySource, /life-strategy-source__(?:bullet|check|quote|divider|image|heading|text|paragraph)/, "Markdown content must not recreate shadcn\/typeset primitives with custom CSS hooks");
assert.doesNotMatch(legacyStyles, /\.life-strategy-source__(?:bullet|check|quote|divider|image|heading|text|paragraph)/, "Legacy CSS must not skin shadcn\/typeset content primitives");
assert.doesNotMatch(legacyStyles, /\.life-strategy-source\s+a\b/, "Markdown links must inherit the shadcn\/typeset theme treatment");
assert.doesNotMatch(legacyStyles, /\.life-strategy(?:__|\s*\{)/, "The retired custom life-strategy skin must not return");
for (const [source, label] of [[coachingSessionsSource, "CoachingSessions"], [conferencesSource, "Conferences"], [coursesSource, "Courses"], [labResultsSource, "LabResults"], [performanceReviewSource, "PerformanceReview"], [medicationsSource, "Medications"], [workoutsSource, "Workouts"]]) {
  assert.doesNotMatch(source, /\bspace-[xy]-/, `${label} must use flex/grid gap instead of space-* utilities`);
  assert.match(source, /not-typeset rollapp-body/, `${label} must opt its shadcn composition out of prose styling`);
}
for (const rule of [
  "--typeset-size`, `--typeset-leading`, and `--typeset-flow",
  "margin-block-start",
  "not-typeset",
  "do not use `space-x-*` or `space-y-*`",
]) {
  assert(agents.includes(rule), `Workspace typography rules must document ${rule}`);
}
assert.match(typeset, /@media \(max-width:\s*640px\)[\s\S]*?--typeset-size:\s*1rem;[\s\S]*?--typeset-leading:\s*1\.75rem;/, "Rollapp mobile body copy must remain 16px with a 28px line height");
assert.match(typeset, /@layer utilities\s*\{[\s\S]*?\.rollapp-body\s*\{[\s\S]*?font-family:\s*var\(--font-body\);[\s\S]*?font-size:\s*var\(--text-rollapp-body\);[\s\S]*?font-weight:\s*400;[\s\S]*?letter-spacing:\s*0;[\s\S]*?line-height:\s*var\(--text-rollapp-body--line-height\);/, "Non-Wishlist application surfaces must expose the canonical body utility");
assert.doesNotMatch(theme, /--text-body(?:--line-height)?:/, "Canonical Rollapp theme tokens must not collide with the legacy Wishlist --text-body token");
assert.match(legacyStyles, /--text-caption:\s*13px;/, "The smallest legacy caption token must be 13px");
assert.equal((app.match(/className="auth-page rollapp-body"/g) || []).length, 3, "Every authentication surface must use the canonical body utility");
for (const surface of [
  'className="contact-detail-drawer rollapp-body"',
  'className="profile-settings-dialog rollapp-body"',
  'className="not-found rollapp-body"',
]) {
  assert(app.includes(surface), `Non-Wishlist surface is missing canonical body typography: ${surface}`);
}
assert((app.match(/app-page[^"`]*typeset typeset-rollapp/g) || []).length >= 4, "Sphere, contacts, and friends pages must use the Rollapp content preset");
assert.match(legacyStyles, /\.contact-card__bio-text\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-wrap:\s*pretty;/, "Contact roles must wrap inside their cards");
assert.match(legacyStyles, /\.contact-card__avatar\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?justify-self:\s*start;/, "Contact avatars must stay aligned to the left edge of every card");
for (const match of app.matchAll(/className=(?:"([^"]*wishes-page[^"]*)"|\{`([^`]*wishes-page[^`]*)`\})/g)) {
  assert(!`${match[1] || ""}${match[2] || ""}`.includes("typeset"), "Wishlist typography must remain outside the Rollapp content preset");
}
assert.doesNotMatch(performanceReviewSource, /text-\[15px\]|leading-\[1\.75\]/, "Performance review body copy must inherit the shared Rollapp body utility");
const reviewBlocksSource = performanceReviewSource.slice(
  performanceReviewSource.indexOf("function ReviewBlocks"),
  performanceReviewSource.indexOf("function hasMeaningfulContent"),
);
assert.match(reviewBlocksSource, /className="flex flex-col gap-5 text-foreground"/, "Performance review narrative copy must use the canonical foreground and parent gap utilities");
assert.doesNotMatch(reviewBlocksSource, /text-muted-foreground/, "Performance review narrative copy must not use the muted foreground");
for (const marker of [
  ".development-plan p",
  ".development-plan li",
  ".four-question__answer p",
  ".mission-text p:not(.mission-text__label)",
  ".mission-text li",
  "Non-Wishlist narrative copy consumes the shared body contract",
  ".hogan-report__section-heading > p",
  ".gallup-report-prose p",
]) {
  assert(legacyStyles.includes(marker), `Non-Wishlist body coverage is missing ${marker}`);
}
const narrativeContractStart = legacyStyles.indexOf("Non-Wishlist narrative copy consumes the shared body contract");
const narrativeContractEnd = legacyStyles.indexOf("The persistent profile hero owns the vertical gap", narrativeContractStart);
const narrativeContract = legacyStyles.slice(narrativeContractStart, narrativeContractEnd);
assert.match(narrativeContract, /color:\s*var\(--foreground\);/, "Non-Wishlist narrative copy must use the canonical foreground color");

function tokenBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = theme.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert(match, `Canonical shadcn theme is missing the ${selector} token block`);
  return Object.fromEntries(
    [...match[1].matchAll(/^\s*(--[\w-]+):\s*([^;]+);\s*$/gm)].map((token) => [token[1], token[2].trim()]),
  );
}

assert.deepEqual(tokenBlock(":root"), {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.145 0 0)",
  "--primary": "oklch(0.205 0 0)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--secondary": "oklch(0.97 0 0)",
  "--secondary-foreground": "oklch(0.205 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.556 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.708 0 0)",
  "--chart-1": "oklch(0.87 0 0)",
  "--chart-2": "oklch(0.556 0 0)",
  "--chart-3": "oklch(0.439 0 0)",
  "--chart-4": "oklch(0.371 0 0)",
  "--chart-5": "oklch(0.269 0 0)",
  "--radius": "0.625rem",
  "--sidebar": "oklch(0.985 0 0)",
  "--sidebar-foreground": "oklch(0.145 0 0)",
  "--sidebar-primary": "oklch(0.205 0 0)",
  "--sidebar-primary-foreground": "oklch(0.985 0 0)",
  "--sidebar-accent": "oklch(0.97 0 0)",
  "--sidebar-accent-foreground": "oklch(0.205 0 0)",
  "--sidebar-border": "oklch(0.922 0 0)",
  "--sidebar-ring": "oklch(0.708 0 0)",
}, "The light tokens must exactly match the official neutral preset");

assert.deepEqual(tokenBlock(".dark"), {
  "--background": "oklch(0.145 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.205 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--popover": "oklch(0.205 0 0)",
  "--popover-foreground": "oklch(0.985 0 0)",
  "--primary": "oklch(0.922 0 0)",
  "--primary-foreground": "oklch(0.205 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--accent": "oklch(0.269 0 0)",
  "--accent-foreground": "oklch(0.985 0 0)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--ring": "oklch(0.556 0 0)",
  "--chart-1": "oklch(0.87 0 0)",
  "--chart-2": "oklch(0.556 0 0)",
  "--chart-3": "oklch(0.439 0 0)",
  "--chart-4": "oklch(0.371 0 0)",
  "--chart-5": "oklch(0.269 0 0)",
  "--sidebar": "oklch(0.205 0 0)",
  "--sidebar-foreground": "oklch(0.985 0 0)",
  "--sidebar-primary": "oklch(0.488 0.243 264.376)",
  "--sidebar-primary-foreground": "oklch(0.985 0 0)",
  "--sidebar-accent": "oklch(0.269 0 0)",
  "--sidebar-accent-foreground": "oklch(0.985 0 0)",
  "--sidebar-border": "oklch(1 0 0 / 10%)",
  "--sidebar-ring": "oklch(0.556 0 0)",
}, "The dark tokens must exactly match the official neutral preset");

for (const token of ["--muted", "--radius", "--radius-sm", "--radius-lg"]) {
  assert(
    !new RegExp(`^\\s*${token.replaceAll("-", "\\-")}:`, "m").test(legacyStyles),
    `Legacy CSS must not redeclare the official shadcn token ${token}`,
  );
}
assert.doesNotMatch(legacyStyles, /--brand-logo-(?:left|right|center):/, "The retired multicolor CSS logo tokens must not return");
for (const component of ["Alert", "Badge", "Button", "Card", "Accordion", "Input", "Spinner", "Tabs"]) {
  assert(new RegExp(`<${component}\\b`).test(labResultsSource), `LabResults must compose the official shadcn ${component}`);
}
for (const component of ["Alert", "Badge", "Button", "Card", "Field", "Input", "Select", "Spinner", "Textarea"]) {
  assert(new RegExp(`<${component}\\b`).test(coachingSessionsSource), `CoachingSessions must compose the official shadcn ${component}`);
  assert(new RegExp(`<${component}\\b`).test(coursesSource), `Courses must compose the official shadcn ${component}`);
  assert(new RegExp(`<${component}\\b`).test(conferencesSource), `Conferences must compose the official shadcn ${component}`);
  assert(new RegExp(`<${component}\\b`).test(medicationsSource), `Medications must compose the official shadcn ${component}`);
  assert(new RegExp(`<${component}\\b`).test(workoutsSource), `Workouts must compose the official shadcn ${component}`);
}
for (const [source, name] of [[medicationsSource, "Medications"]]) {
  assert(/<Empty\b/.test(source), `${name} must compose the official shadcn Empty`);
}
for (const [source, name] of [[coachingSessionsSource, "CoachingSessions"], [coursesSource, "Courses"], [conferencesSource, "Conferences"], [workoutsSource, "Workouts"]]) {
  assert.doesNotMatch(source, /<Empty\b/, `${name} must rely on the primary Add action instead of a duplicate empty state`);
  assert(/<EducationSectionHeader\b/.test(source), `${name} must expose the shared primary section actions`);
}
for (const source of [coachingSessionsSource, coursesSource, conferencesSource, medicationsSource, workoutsSource]) {
  assert(/<Drawer\b/.test(source), "Data cards must create and edit in the official shadcn Drawer");
}
assert.doesNotMatch(coachingSessionsSource, /<button\b/, "CoachingSessions interactive controls must use shadcn primitives");
assert.doesNotMatch(coachingSessionsSource, /className="[^"]*\bcoaching(?:-|__)/, "CoachingSessions must use shadcn utilities instead of a custom component skin");
assert.doesNotMatch(coursesSource, /<button\b/, "Courses interactive controls must use shadcn primitives");
assert.doesNotMatch(coursesSource, /className="[^"]*\bcourses?(?:-|__)/, "Courses must use shadcn utilities instead of a custom component skin");
assert.doesNotMatch(conferencesSource, /<button\b/, "Conferences interactive controls must use shadcn primitives");
assert.doesNotMatch(conferencesSource, /className="[^"]*\bconferences?(?:-|__)/, "Conferences must use shadcn utilities instead of a custom component skin");
assert.doesNotMatch(medicationsSource, /<button\b/, "Medications interactive controls must use shadcn primitives");
assert.doesNotMatch(medicationsSource, /className="[^"]*\bmedications?(?:-|__)/, "Medications must use shadcn utilities instead of a custom component skin");
assert.doesNotMatch(workoutsSource, /<button\b/, "Workouts interactive controls must use shadcn primitives");
assert.doesNotMatch(workoutsSource, /className="[^"]*\bworkouts?(?:-|__)/, "Workouts must use shadcn utilities instead of a custom component skin");
assert.doesNotMatch(labResultsSource, /<(?:button|details|summary)\b/, "LabResults interactive controls must use shadcn primitives");
assert.doesNotMatch(labResultsSource, /className="[^"]*\blab-(?:results|overview|attention|trend|report|status|section)/, "LabResults must use shadcn utilities instead of its retired component skin");
assert.match(labResultsSource, /<AccordionItem className="not-last:data-open:border-b-0"/, "An open laboratory section must not keep a redundant bottom divider");
assert.doesNotMatch(legacyStyles, /\.lab-(?:results|overview|attention|trend|report|status|section)\b/, "The retired laboratory CSS skin must not return");
const healthPlaceholderSource = app.slice(app.indexOf('sphere.id === "health"'), app.indexOf(': <section aria-labelledby', app.indexOf('sphere.id === "health"')));
for (const component of ["Empty", "EmptyHeader", "EmptyMedia", "EmptyTitle", "EmptyDescription", "EmptyContent", "Badge"]) {
  assert(new RegExp(`<${component}\\b`).test(healthPlaceholderSource), `Health placeholders must compose the official shadcn ${component}`);
}
const logoSource = app.slice(app.indexOf("function Logo"), app.indexOf("function Avatar"));
assert.match(logoSource, /aria-label="Rollapp — в приложение"/, "The mark-only logo must keep its accessible name");
assert.match(logoSource, /<svg[\s\S]*className="logo__mark"/, "Logo must render the vector mark as inline SVG");
assert.match(logoSource, /fill="currentColor"/, "The vector logo must inherit the surrounding foreground color");
assert.match(logoSource, /fillRule="evenodd"/, "The vector logo must preserve its transparent square cutout");
assert.doesNotMatch(logoSource, /<(?:img|image|foreignObject)\b/, "The vector logo must not embed a raster image");
assert.doesNotMatch(logoSource, /<span\b|className="logo__word"|>\s*rollapp\s*</i, "Logo must render only the vector mark, without a visible wordmark");
const topbarShareButtons = [...app.matchAll(/<ShadcnButton\b([^>]*\bglobal-app-chrome__share\b[^>]*)>([\s\S]*?)<\/ShadcnButton>/g)];
assert.equal(topbarShareButtons.length, 1, "The persistent application chrome must render one canonical Share icon button");
for (const [, attributes, children] of topbarShareButtons) {
  assert(/\bvariant="outline"/.test(attributes), "The topbar Share action must keep its outline treatment");
  assert(/\bsize="icon"/.test(attributes), "The topbar Share action must use the 48px shadcn icon-button size");
  assert(/\btype="button"/.test(attributes), "The topbar Share action must not submit a surrounding form");
  assert(/\bclassName="[^"]*\brounded-full\b[^"]*"/.test(attributes), "The topbar Share action must be circular");
  assert(/\baria-label="Поделиться"/.test(attributes), "The icon-only Share action must keep its accessible name");
  assert(/\btitle="Поделиться"/.test(attributes), "The icon-only Share action must keep its native tooltip");
  assert(/^\s*<Share2\s+aria-hidden="true"\s*\/>\s*$/.test(children), "The topbar Share action must render only its decorative icon, without visible text");
}
assert(
  /\.global-app-chrome__share\s*\{[^}]*\bwidth:\s*48px;[^}]*\bheight:\s*48px;[^}]*\bpadding:\s*0;[^}]*\bborder-radius:\s*var\(--radius-pill\);/s.test(legacyStyles),
  "The topbar Share action must keep its circular 48x48 geometry",
);
const relationshipHeroSource = app.slice(app.indexOf("function WishesProfileControls"), app.indexOf("function ProtectedApp"));
const relationshipPublicSource = app.slice(app.indexOf("function PublicProfile"), app.indexOf("function NotFound"));
for (const [source, label] of [[relationshipHeroSource, "personal"], [relationshipPublicSource, "public owner"]]) {
  assert.match(source, /<Users aria-hidden="true"\s*\/>\s*Подписки/, `The ${label} subscriptions link must keep its decorative Users icon`);
  assert.match(source, /<CircleUserRound aria-hidden="true"\s*\/>\s*Подписчики/, `The ${label} followers link must keep its decorative profile icon`);
}
assert(
  /\.app-layout--dark\s+\.wishes-page__friend-links\s*>\s*a\s*\{[^}]*\bgap:\s*8px;/s.test(legacyStyles)
    && /\.app-layout--dark\s+\.wishes-page__friend-links\s*>\s*a\s*>\s*svg\s*\{[^}]*\bwidth:\s*20px;[^}]*\bheight:\s*20px;/s.test(legacyStyles),
  "Relationship links must keep their 8px icon gap and 20x20 icon geometry",
);
const listColorTokens = Object.fromEntries(
  [...legacyStyles.matchAll(/^\s*--list-color-(coral|blue|lime|sun|ink):\s*([^;]+);/gm)]
    .map((match) => [match[1], match[2].trim()]),
);
assert.deepEqual(listColorTokens, {
  coral: "#f26b4f",
  blue: "#0333ff",
  lime: "#e0ff63",
  sun: "#f5d44b",
  ink: "#27272a",
}, "List cover choices must remain five distinct semantic colors");
assert.equal(new Set(Object.values(listColorTokens)).size, 5, "List cover colors must not collapse into neutral theme aliases");

assert.match(html, /<html[^>]*class=["'][^"']*\bdark\b/, "The official dark theme must be active on <html>");
assert.match(html, /<meta[^>]*name=["']color-scheme["'][^>]*content=["']dark["']/, "The document must announce its dark color scheme");
assert.equal((main.match(/["']\.\/index\.css["']/g) ?? []).length, 1, "The canonical shadcn theme must be imported exactly once");
assert(!main.includes("shadcn.css"), "The legacy shadcn.css skin must not be imported");
assert.match(
  legacyStyles,
  /^@layer properties, theme, base, legacy, components, utilities;/,
  "Legacy layout must sit above Tailwind Preflight and below shadcn component utilities",
);
let legacyThemeExists = true;
try {
  await access(path.join(root, "src/shadcn.css"));
} catch (error) {
  if (error.code === "ENOENT") legacyThemeExists = false;
  else throw error;
}
assert(!legacyThemeExists, "The legacy src/shadcn.css skin must be removed");

const requiredUiFiles = [
  "avatar.jsx",
  "badge.jsx",
  "button.jsx",
  "card.jsx",
  "checkbox.jsx",
  "dialog.jsx",
  "drawer.jsx",
  "dropdown-menu.jsx",
  "input.jsx",
  "native-select.jsx",
  "select.jsx",
  "sheet.jsx",
  "sidebar.jsx",
  "sonner.jsx",
  "switch.jsx",
  "tabs.jsx",
  "textarea.jsx",
  "toggle-group.jsx",
];
const uiDir = path.join(root, "src/components/ui");
const installedUiFiles = new Set(await readdir(uiDir));
for (const file of requiredUiFiles) {
  assert(installedUiFiles.has(file), `Official shadcn component is not installed: ${file}`);
}

const expectedBaseUiImports = {
  "alert-dialog.jsx": "@base-ui/react/alert-dialog",
  "avatar.jsx": "@base-ui/react/avatar",
  "badge.jsx": "@base-ui/react/use-render",
  "button.jsx": "@base-ui/react/button",
  "checkbox.jsx": "@base-ui/react/checkbox",
  "dialog.jsx": "@base-ui/react/dialog",
  "drawer.jsx": "@base-ui/react/drawer",
  "dropdown-menu.jsx": "@base-ui/react/menu",
  "input.jsx": "@base-ui/react/input",
  "popover.jsx": "@base-ui/react/popover",
  "radio-group.jsx": "@base-ui/react/radio-group",
  "scroll-area.jsx": "@base-ui/react/scroll-area",
  "select.jsx": "@base-ui/react/select",
  "separator.jsx": "@base-ui/react/separator",
  "sheet.jsx": "@base-ui/react/dialog",
  "sidebar.jsx": "@base-ui/react/use-render",
  "switch.jsx": "@base-ui/react/switch",
  "tabs.jsx": "@base-ui/react/tabs",
  "toggle-group.jsx": "@base-ui/react/toggle-group",
  "toggle.jsx": "@base-ui/react/toggle",
  "tooltip.jsx": "@base-ui/react/tooltip",
};
for (const [file, expectedImport] of Object.entries(expectedBaseUiImports)) {
  assert(installedUiFiles.has(file), `Expected Base Nova component is not installed: ${file}`);
  const source = await readFile(path.join(uiDir, file), "utf8");
  assert(source.includes(expectedImport), `${file} is not the official Base UI-backed shadcn primitive`);
  assert(!source.includes("@radix-ui/"), `${file} must not mix Base UI and Radix primitives`);
}

const buttonSource = await readFile(path.join(uiDir, "button.jsx"), "utf8");
const inputSource = await readFile(path.join(uiDir, "input.jsx"), "utf8");
const inputGroupSource = await readFile(path.join(uiDir, "input-group.jsx"), "utf8");
const selectSource = await readFile(path.join(uiDir, "select.jsx"), "utf8");
const switchSource = await readFile(path.join(uiDir, "switch.jsx"), "utf8");
const textareaSource = await readFile(path.join(uiDir, "textarea.jsx"), "utf8");
const checkboxSource = await readFile(path.join(uiDir, "checkbox.jsx"), "utf8");
const radioSource = await readFile(path.join(uiDir, "radio-group.jsx"), "utf8");
const dropdownSource = await readFile(path.join(uiDir, "dropdown-menu.jsx"), "utf8");
assert(/size = "default"/.test(buttonSource) && /default:\s*"h-8\b/.test(buttonSource) && /lg: "h-9\b/.test(buttonSource), "Button must keep the official base-nova sizes");
assert(/icon: "size-8"/.test(buttonSource) && /"icon-lg": "size-9"/.test(buttonSource), "Icon buttons must keep the official base-nova sizes");
assert(/"h-8 w-full/.test(inputSource) && /text-base/.test(inputSource) && /md:text-sm/.test(inputSource), "Input must keep the official base-nova geometry");
assert(/relative flex h-8 w-full/.test(inputGroupSource), "InputGroup must keep the official base-nova 32px source geometry");
assert(/size = "default"/.test(selectSource) && /data-\[size=default\]:h-8/.test(selectSource) && /data-\[size=sm\]:h-7/.test(selectSource), "SelectTrigger must keep the official base-nova sizes");
assert(/select-item[\s\S]*?py-1[^"\n]*text-sm/.test(selectSource), "Select items must keep the official compact rows");
assert(/data-\[size=default\]:h-\[18\.4px\]/.test(switchSource) && /data-\[size=default\]:w-\[32px\]/.test(switchSource) && /group-data-\[size=default\]\/switch:size-4/.test(switchSource), "Switch must keep the official base-nova geometry");
assert(/min-h-16/.test(textareaSource) && /text-base/.test(textareaSource) && /md:text-sm/.test(textareaSource), "Textarea must keep the official base-nova source geometry");
assert(/\bsize-4\b/.test(checkboxSource) && /\[&>svg\]:size-3\.5/.test(checkboxSource), "Checkbox must keep the official base-nova source geometry");
assert(/radio-group-item[\s\S]*?\bsize-4\b/.test(radioSource) && /radio-group-indicator[\s\S]*?\bsize-4\b/.test(radioSource), "RadioGroupItem must keep the official base-nova source geometry");
assert((dropdownSource.match(/py-1[^"\n]*text-sm/g) || []).length >= 4 && !/min-h-12/.test(dropdownSource), "Dropdown rows must keep the official compact geometry");
assert(/\bw-\(--anchor-width\)/.test(dropdownSource), "DropdownMenuContent must keep the official Base UI anchor-width geometry");

assert(theme.includes("Rollapp's product-level Large control contract"), "The app-level Large control policy must remain documented separately from the official primitives");
const largePolicyStart = theme.indexOf("Rollapp's product-level Large control contract");
const largePolicyEnd = theme.indexOf(".wishes-page .list-tabs", largePolicyStart);
const largePolicy = theme.slice(largePolicyStart, largePolicyEnd < 0 ? undefined : largePolicyEnd);
assert(/\[class~="group\/button"\][\s\S]*?min-(?:block-size|height):\s*3rem/.test(largePolicy), "App buttons must keep a minimum 48px Large height");
for (const slot of ["toggle", "toggle-group-item", "tabs-trigger"]) {
  assert(largePolicy.includes(`[data-slot="${slot}"]`), `App ${slot} controls must participate in the 48px Large policy`);
}
assert(/\[data-slot="input"\]:not\(\.sr-only\)/.test(largePolicy) && /\[data-slot="input-group"\]/.test(largePolicy), "App Input and InputGroup sizing must exclude hidden file inputs");
assert(/\[data-slot="input-otp-slot"\]\s*\{[^}]*width:\s*3rem;[^}]*height:\s*3rem;/s.test(largePolicy), "App OTP cells must keep the 48px Large geometry");
assert(largePolicy.includes('[data-slot="native-select"]'), "App NativeSelect controls must participate in the 48px Large policy");
assert(/\[data-slot="select-trigger"\][\s\S]*?min-(?:block-size|height):\s*3rem/.test(largePolicy), "App Select triggers must keep a minimum 48px Large height");
assert(/\[data-slot="textarea"\][\s\S]*?min-(?:block-size|height):\s*6rem/.test(largePolicy), "App Textareas must keep a minimum 96px Large height");
assert(/\[data-slot="dropdown-menu-item"\][\s\S]*?\[data-slot="select-item"\][\s\S]*?min-(?:block-size|height):\s*3rem/.test(largePolicy), "Portalled menu and Select rows must keep a minimum 48px Large height");
assert(/\[data-slot="switch"\]\s*\{[^}]*width:\s*2\.75rem;[^}]*height:\s*1\.5rem;/s.test(largePolicy), "App Switches must keep the 44x24 Large track");
assert(/\[data-slot="switch"\]\s*>\s*\[data-slot="switch-thumb"\]\s*\{[^}]*width:\s*1\.25rem;[^}]*height:\s*1\.25rem;/s.test(largePolicy), "App Switches must keep the 20px Large thumb");
assert(/\[data-slot="checkbox"\]\s*\{[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem;/s.test(largePolicy), "App Checkboxes must keep the 24px Large geometry");
assert(/\[data-slot="checkbox-indicator"\]\s*>\s*svg\s*\{[^}]*width:\s*1\.25rem;[^}]*height:\s*1\.25rem;/s.test(largePolicy), "App Checkbox indicators must keep the 20px Large geometry");
assert(/\[data-slot="radio-group-item"\][\s\S]*?width:\s*1\.5rem;[\s\S]*?height:\s*1\.5rem;/.test(largePolicy), "App Radio controls must keep the 24px Large geometry");
assert((app.match(/className="sr-only !size-px"\s+type="file"/g) || []).length === 2, "Hidden file inputs must stay outside the visible Large-control geometry contract");
for (const className of ["data-[variant=destructive]:text-destructive", "data-[variant=destructive]:focus:bg-destructive/10", "dark:data-[variant=destructive]:focus:bg-destructive/20", "data-[variant=destructive]:*:[svg]:text-destructive"]) {
  assert(dropdownSource.includes(className), `DropdownMenuItem must keep the official ${className} destructive state`);
}
assert((app.match(/\bapp-destructive-menu-item\b/g) || []).length >= 2, "Wish card and detail delete items must share the clean destructive hover treatment");
assert(theme.includes("--app-destructive-menu-surface: oklch(0.53 0.2 25)"), "Destructive menu hover must use the app's clean red surface token");
assert(theme.includes("--app-destructive-menu-surface-foreground: oklch(0.985 0 0)"), "Destructive menu hover must use a contrast-safe foreground token");
assert(/\.app-destructive-menu-item:is\(:hover, :focus\)[\s\S]*?background-color:\s*var\(--app-destructive-menu-surface\)/.test(theme), "Destructive menu hover and keyboard focus must share the same clean red surface");
assert(/\.app-destructive-menu-item:is\(:hover, :focus\)\s*>\s*svg[\s\S]*?color:\s*var\(--app-destructive-menu-surface-foreground\)/.test(theme), "Destructive menu hover must keep its icon legible");
assert(!/dark:data-\[variant=destructive\]:focus:bg-destructive\/30/.test(app), "Destructive menu items must not use the low-contrast translucent red override");
assert(!/variant="destructive"\s+className="[^"]*\bdanger\b/.test(app), "Destructive menu items must not restore the legacy danger class");

for (const component of [
  "avatar",
  "badge",
  "button",
  "card",
  "drawer",
  "dropdown-menu",
  "input",
  "scroll-area",
  "select",
  "sonner",
  "switch",
  "textarea",
  "toggle-group",
]) {
  assert(
    app.includes(`@/components/ui/${component}`),
    `App.jsx does not use the installed shadcn ${component} component`,
  );
}

for (const tag of ["input", "textarea", "select"]) {
  assert(!new RegExp(`<${tag}\\b`).test(app), `App.jsx still contains a raw <${tag}> primitive`);
}
const rawButtons = [...app.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
assert(
  rawButtons.length === 2
    && rawButtons.every((tag) => /className="wishes-page__identity"/.test(tag) && /type="button"/.test(tag)),
  `App.jsx contains an unauthorized raw button: ${rawButtons.join(" | ")}`,
);
assert(!/role=["']menu(?:item|itemcheckbox)?["']/.test(app), "App.jsx still contains a hand-written menu role");
assert(!app.includes("card-menu__dismiss-layer"), "App.jsx still contains the legacy menu dismissal layer");
assert(!app.includes("createPortal"), "App.jsx still contains a hand-written portal primitive");
assert(!app.includes("window.confirm"), "App.jsx still uses a native confirm dialog");
assert(!app.includes("modal-icon"), "Modals must not render decorative leading icon tiles");
assert(!/<AlertDialogMedia\b/.test(app), "Alert dialogs must not render decorative leading icon tiles");
assert(!app.includes("PROFILE_EDITOR_PATH"), "Profile editing must not keep the retired settings deep link");
assert(!app.includes("/app/settings"), "App.jsx must not link to the retired standalone settings route");
assert(!app.includes("function SettingsPage("), "App.jsx still defines the retired standalone SettingsPage");
assert(!app.includes("function PhoneSettingsModal("), "App.jsx still defines the retired settings-only phone editor");
assert(
  /<Route path="settings" element=\{<Navigate to=\{APP_HOME\} replace \/>\} \/>/.test(app),
  "The retired /app/settings route must redirect to the app home",
);
const profileEditorProviderSource = app.slice(app.indexOf("function ProfileEditorProvider"), app.indexOf("function Logo"));
assert(/<ProfileSettingsModal\b/.test(profileEditorProviderSource), "ProfileEditorProvider must own the profile editor modal");
assert(/returnFocusRef/.test(profileEditorProviderSource), "ProfileEditorProvider must retain the opener for focus restoration");
const profileSettingsSource = app.slice(app.indexOf("function ProfileSettingsModal"), app.indexOf("function PublicProfile"));
for (const component of ["Drawer", "DrawerContent", "DrawerHeader", "DrawerTitle", "DrawerDescription", "ScrollArea", "DrawerFooter", "FieldGroup"]) {
  assert(new RegExp(`<${component}\\b`).test(profileSettingsSource), `ProfileSettingsModal must compose the official shadcn ${component} directly`);
}
assert(!/<Modal\b/.test(profileSettingsSource), "ProfileSettingsModal must not use the legacy Modal adapter");
assert(/<DrawerClose\b/.test(profileSettingsSource), "ProfileSettingsModal must render an explicit DrawerClose action (the shadcn Drawer has no built-in close button)");
assert(!/<DialogClose\b/.test(profileSettingsSource), "ProfileSettingsModal must use DrawerClose instead of the retired DialogClose");
assert(!/viewportClassName=|showCloseButton=|ariaLabel=/.test(profileSettingsSource), "ProfileSettingsModal must use the native shadcn drawer shell");
assert(!/modal-(?:backdrop|heading|actions)|data-modal-initial-focus|settings-editor/.test(profileSettingsSource), "ProfileSettingsModal must not restore legacy modal hooks");
const profileDrawerTag = profileSettingsSource.match(/<Drawer\b[^>]*>/)?.[0] || "";
assert(profileDrawerTag.includes("open") && profileDrawerTag.includes("onOpenChange="), "ProfileSettingsModal must keep the native Drawer controlled");
assert(profileDrawerTag.includes('swipeDirection={isMobile ? "down" : "right"}'), "ProfileSettingsModal must stay a right-side drawer on desktop and a bottom sheet on mobile");
assert(profileDrawerTag.includes("showSwipeHandle"), "ProfileSettingsModal drawer must show the swipe handle");
assert(/finalFocus=\{finalFocus\}/.test(profileSettingsSource), "ProfileSettingsModal must restore focus to its opener");
assert(/<DrawerTitle className="sr-only">Изменить профиль<\/DrawerTitle>/.test(profileSettingsSource), "ProfileSettingsModal must expose an accessible title without rendering the removed heading");
assert(/<DrawerDescription className="sr-only">Редактирование данных профиля\.<\/DrawerDescription>/.test(profileSettingsSource), "ProfileSettingsModal must keep an accessible description without rendering helper copy");
assert(/<form\b[^>]*onSubmit=\{submit\}/.test(profileSettingsSource), "ProfileSettingsModal must keep one native form submission path");
assert(!/Ссылка на фото|settings-profile-avatar-url/.test(profileSettingsSource), "ProfileSettingsModal must not expose the retired avatar URL field");
const profileLogoutLabel = profileSettingsSource.indexOf("<span>Выйти из аккаунта</span>");
const profileLogoutStart = profileSettingsSource.lastIndexOf("<ShadcnButton", profileLogoutLabel);
const profileLogoutEnd = profileSettingsSource.indexOf("</ShadcnButton>", profileLogoutLabel);
const profileLogoutSource = profileSettingsSource.slice(profileLogoutStart, profileLogoutEnd + "</ShadcnButton>".length);
assert(profileLogoutLabel >= 0 && profileLogoutStart >= 0 && profileLogoutEnd >= 0, "ProfileSettingsModal must keep its logout action");
assert(/type="button"/.test(profileLogoutSource) && /variant="destructive"/.test(profileLogoutSource), "Profile logout must remain a native destructive shadcn Button");
assert(!/\bw-full\b|\bjustify-start\b/.test(profileLogoutSource), "Profile logout must render as a compact button, not a full-width action row");
const profileSettingsContentTag = profileSettingsSource.match(/<DrawerContent\b[^>]*>/)?.[0] || "";
assert(profileSettingsContentTag.includes("profile-settings-dialog"), "ProfileSettingsModal must mark its DrawerContent with the profile-settings-dialog class");
assert(!/(?:^|\s)(?:h-dvh|max-h-none|w-screen|top-0|left-0|translate-x-0|translate-y-0|max-w-none|sm:max-w-none|data-\[swipe-direction=down\]:rounded-t-none|data-\[swipe-direction=down\]:border-t-0)(?:\s|$)/.test(profileSettingsContentTag), "ProfileSettingsModal must stay a native side drawer without fullscreen or Dialog positioning overrides");
assert(!/max-h-\[min\(calc\(100dvh-2rem\),44rem\)\]/.test(profileSettingsContentTag), "ProfileSettingsModal must not restore the compact viewport height cap");
for (const component of ["DrawerHeader", "ScrollArea", "DrawerFooter"]) {
  const tag = profileSettingsSource.match(new RegExp(`<${component}\\b[^>]*>`))?.[0] || "";
  for (const className of ["mx-auto", "w-full", "max-w-md"]) {
    assert(tag.includes(className), `ProfileSettingsModal ${component} must align to the shared 448px rail with ${className}`);
  }
}
const [dialogSource, alertDialogSource] = await Promise.all([
  read("src/components/ui/dialog.jsx"),
  read("src/components/ui/alert-dialog.jsx"),
]);
assert(/w-full max-w-\[calc\(100%-2rem\)\]/.test(dialogSource) && /sm:max-w-sm/.test(dialogSource), "DialogContent must keep the official base-nova width and viewport gutters");
assert(!/max-w-none|viewportClassName/.test(dialogSource), "DialogContent must not contain app-specific fullscreen APIs");
assert(/data-\[size=default\]:max-w-xs/.test(alertDialogSource) && /data-\[size=default\]:sm:max-w-sm/.test(alertDialogSource), "AlertDialogContent must keep the official base-nova widths");
assert(!/max-w-none/.test(alertDialogSource), "AlertDialogContent must not contain app-specific fullscreen geometry");
assert(!/function Modal\b|viewportClassName=/.test(app), "App.jsx must not restore the legacy modal adapter");
assert(!/nativeButton=\{false\}/.test(app), "Styled links must use native Link/a elements with buttonVariants");
const appProfileButtonSource = app.slice(app.indexOf("function AppProfileButton"), app.indexOf("function FriendsTopbar"));
assert(/<ShadcnButton\b/.test(appProfileButtonSource), "AppProfileButton must use the official shadcn Button");
assert(/type="button"/.test(appProfileButtonSource) && /onClick=\{openProfileEditor\}/.test(appProfileButtonSource), "AppProfileButton must open profile editing in place");
assert(!/<(?:Link|NavLink)\b/.test(appProfileButtonSource), "AppProfileButton must not navigate away from the current screen");
const wishesProfileHeroSource = app.slice(app.indexOf("function PersistentProfileHero"), app.indexOf("function WishesProfileControls"));
assert(/<button\b/.test(wishesProfileHeroSource) && /type="button"/.test(wishesProfileHeroSource), "PersistentProfileHero must expose a native profile button");
assert(/onClick=\{openProfileEditor\}/.test(wishesProfileHeroSource), "PersistentProfileHero must open profile editing in place");
const listTileContentSource = app.slice(app.indexOf("function ListTileContent"), app.indexOf("function useAsync"));
assert(/data-slot="list-tile-label"/.test(listTileContentSource) && /data-slot="list-tile-meta"/.test(listTileContentSource) && /data-slot="list-tile-count"/.test(listTileContentSource), "List tiles must reserve separate title and count rows");
assert(/data-slot="list-tile-meta"[\s\S]*?<LockKeyhole\b[\s\S]*?data-slot="list-tile-count"/.test(listTileContentSource), "Private-list icon must share the metadata row instead of consuming a third tile row");
assert((app.match(/<ListTileContent\b/g) || []).length >= 4, "Personal and public collection tiles must share the overlap-safe list-tile composition");
const wishDetailsSource = app.slice(app.indexOf("function WishDetailsModal"), app.indexOf("function ListModal"));
const wishCardSource = app.slice(app.indexOf("function WishCard"), app.indexOf("function WishesPage"));
assert(!/(?:Забронировать|Забронировано вами|Уже забронировано|Снять бронь)/.test(wishCardSource), "WishCard snippets must not expose reservation actions or status text");
assert(!/\breserve\b/.test(wishCardSource), "WishCard must keep reservation mutations inside WishDetailsModal");
assert(/cardSpace === "places" \? placeSnippetAddress\(wish\.description\)/.test(wishCardSource), "Place snippets must derive an address from saved metadata");
assert(/className="wish-card__place-address"/.test(wishCardSource), "Place snippets must render the available address");
assert(/\.app-layout--dark \.wish-card__body > \.wish-card__place-address[\s\S]*?display: -webkit-box;/u.test(legacyStyles), "Place addresses must remain visible in the dark Wishlist layout");
const primaryWishDetailsDialog = wishDetailsSource.slice(0, wishDetailsSource.indexOf("{deleteOpen &&"));
assert((primaryWishDetailsDialog.match(/onClick=\{reserve\}/g) || []).length >= 2, "WishDetailsModal must retain its primary and overflow-menu reservation actions");
assert(/Забронировать/.test(primaryWishDetailsDialog) && /Снять бронь/.test(primaryWishDetailsDialog), "WishDetailsModal must retain reserve and unreserve labels");
assert(/import \{ Checkbox \} from "@\/components\/ui\/checkbox";/.test(app), "WishDetailsModal must import the official shadcn Checkbox primitive");
const detailListPickerStart = primaryWishDetailsDialog.indexOf("const renderListPickerBody");
const detailListPickerEnd = primaryWishDetailsDialog.indexOf("\n\n  return (", detailListPickerStart);
const detailListPickerSource = detailListPickerStart < 0 || detailListPickerEnd < 0
  ? ""
  : primaryWishDetailsDialog.slice(detailListPickerStart, detailListPickerEnd);
assert(/<Checkbox\b/.test(detailListPickerSource), "WishDetails list picker must render the official shadcn Checkbox");
for (const prop of ["checked={selected}", "readOnly", "tabIndex={-1}", 'role="presentation"', 'aria-hidden="true"']) {
  assert(detailListPickerSource.includes(prop), `WishDetails list picker Checkbox is missing ${prop}`);
}
assert(/className="[^"]*\bpointer-events-none\b[^"]*\bml-auto\b[^"]*"/.test(detailListPickerSource), "WishDetails list picker Checkbox must remain presentational and right-aligned");
assert(/\[&_\[data-slot=dropdown-menu-checkbox-item-indicator\]\]:hidden/.test(detailListPickerSource), "WishDetails list picker must hide the duplicate DropdownMenu checkbox indicator");
assert(!/card-menu__list-state|selected\s*\?\s*<Check\s*\/>\s*:\s*<Plus\s*\/>/.test(detailListPickerSource), "WishDetails list picker must not restore the legacy circular plus/check state");
assert(!/\.card-menu__list-state\b/.test(legacyStyles), "Legacy styles must not restore the circular WishDetails list state");
for (const component of ["Drawer", "DrawerContent", "DrawerHeader", "DrawerTitle", "DrawerDescription"]) {
  assert(new RegExp(`<${component}\\b`).test(primaryWishDetailsDialog), `WishDetailsModal must compose the official shadcn ${component} directly`);
}
assert(!/<(?:Dialog|Drawer)Footer\b/.test(primaryWishDetailsDialog), "WishDetailsModal actions must not restore the skinned footer wrapper");
assert(/data-slot="wish-actions"/.test(primaryWishDetailsDialog), "WishDetailsModal must expose its unwrapped action group");
const wishActionsTag = primaryWishDetailsDialog.match(/<div\b[^>]*data-slot="wish-actions"[^>]*>/)?.[0] || "";
for (const className of ["flex", "w-full", "max-w-md", "flex-nowrap", "gap-2"]) {
  assert(wishActionsTag.includes(className), `WishDetailsModal action group is missing ${className}`);
}
assert(/role="group"/.test(wishActionsTag) && /aria-label="Действия с желанием"/.test(wishActionsTag), "WishDetailsModal action group must keep its accessible group name");
assert(!/(?:border-t|bg-muted\/50|p-4|rounded-b-xl|-mx-4|-mb-4)/.test(wishActionsTag), "WishDetailsModal action group must not restore footer chrome");
assert(
  primaryWishDetailsDialog.indexOf("wish-buy-action") < primaryWishDetailsDialog.indexOf('data-slot="wish-actions"')
    && primaryWishDetailsDialog.indexOf('data-slot="wish-actions"') < primaryWishDetailsDialog.indexOf("<Alert"),
  "WishDetailsModal actions must follow the buy action and precede the guest notice",
);
assert(!/<Modal\b/.test(primaryWishDetailsDialog), "WishDetailsModal must not wrap its primary detail view in the legacy Modal adapter");
assert(/<DrawerClose\b/.test(primaryWishDetailsDialog), "WishDetailsModal must render an explicit DrawerClose action (the shadcn Drawer has no built-in close button)");
assert(!/<DialogClose\b/.test(primaryWishDetailsDialog), "WishDetailsModal must use DrawerClose instead of the retired DialogClose");
assert(!/viewportClassName=/.test(primaryWishDetailsDialog), "WishDetailsModal must use the native shadcn Drawer overlay and positioning");
assert(!/showCloseButton=/.test(primaryWishDetailsDialog), "WishDetailsModal must not re-enable the retired Dialog close API");
const primaryWishDetailsContentTag = primaryWishDetailsDialog.match(/<DrawerContent\b[^>]*>/)?.[0] || "";
assert(/className="[^"]*\bwish-details-dialog\b/.test(primaryWishDetailsContentTag), "WishDetailsModal must mark its DrawerContent with the wish-details-dialog class");
const wishPriceTag = primaryWishDetailsDialog.match(/<strong\b[^>]*data-slot="wish-price"[^>]*>/)?.[0] || "";
for (const className of ["whitespace-nowrap", "tabular-nums", "text-3xl", "leading-none", "font-semibold", "sm:text-4xl"]) {
  assert(wishPriceTag.includes(className), `WishDetailsModal price must keep its enlarged ${className} typography`);
}
assert(!/\btext-lg\b/.test(wishPriceTag), "WishDetailsModal price must not return to the small text-lg size");
assert(
  /\.wish-details-dialog\s+\[data-slot="drawer-close"\]\s*,\s*\.profile-settings-dialog\s+\[data-slot="drawer-close"\]\s*\{[^}]*safe-area-inset-top[^}]*safe-area-inset-right[^}]*\}/s.test(theme),
  "Drawer close actions must stay inside the viewport safe area",
);
assert(!/\[data-slot="dialog-close"\]/.test(theme), "Theme must not keep retired Dialog close-action overrides");
const quickListPickerId = 'id={`wish-detail-lists-${wish.id}`}';
const quickListPickerStart = primaryWishDetailsDialog.indexOf(quickListPickerId);
const quickListPickerTag = quickListPickerStart < 0 ? "" : primaryWishDetailsDialog.slice(quickListPickerStart, primaryWishDetailsDialog.indexOf(">", quickListPickerStart) + 1);
assert(quickListPickerTag && !/\bw-64\b/.test(quickListPickerTag), "WishDetails quick-list popup must not override the trigger-width primitive with a fixed width");
assert(/\bmax-w-\(--available-width\)/.test(quickListPickerTag), "WishDetails quick-list popup must stay inside the Base UI available width");
assert((primaryWishDetailsDialog.match(/\bmax-w-md\b/g) || []).length === 7, "WishDetailsModal must align all seven content sections to the 448px shadcn rail");
assert(!/max-w-\[35rem\]/.test(primaryWishDetailsDialog), "WishDetailsModal must not restore the oversized 560px content rail");
assert(!/(?:^|\s)(?:h-dvh|max-h-none|w-screen|top-0|left-0|translate-x-0|translate-y-0|auto-rows-max|max-w-none|sm:max-w-none|data-\[swipe-direction=down\]:rounded-t-none|data-\[swipe-direction=down\]:border-t-0)(?:\s|$)/.test(primaryWishDetailsContentTag), "WishDetailsModal must stay a native side drawer without fullscreen or Dialog positioning overrides");
const wishDetailsDrawerTag = primaryWishDetailsDialog.match(/<Drawer\b[^>]*>/)?.[0] || "";
assert(wishDetailsDrawerTag.includes('swipeDirection="right"') || wishDetailsDrawerTag.includes('swipeDirection={isMobile ? "down" : "right"}'), "WishDetailsModal must stay a right-side drawer");
assert(wishDetailsDrawerTag.includes("showSwipeHandle"), "WishDetailsModal drawer must show the swipe handle");
const wishMediaTag = primaryWishDetailsDialog.match(/<Card\b[^>]*data-slot="wish-media"[^>]*>/)?.[0] || "";
const wishMediaImageTag = primaryWishDetailsDialog.match(/<img\b[^>]*className="[^"]*"[^>]*>/)?.[0] || "";
assert(wishMediaTag && !/aspect-\[/.test(wishMediaTag), "WishDetailsModal must not force photos into a fixed aspect ratio");
assert(/\bw-full\b/.test(wishMediaImageTag) && /\bh-auto\b/.test(wishMediaImageTag), "WishDetailsModal photos must fill the container width and keep their intrinsic height");
const listModalSource = app.slice(app.indexOf("function ListModal"), app.indexOf("function WishModal"));
for (const component of ["Drawer", "DrawerContent", "DrawerHeader", "DrawerTitle", "DrawerDescription", "DrawerFooter", "Field", "FieldLabel", "FieldDescription", "Switch"]) {
  assert(new RegExp(`<${component}\\b`).test(listModalSource), `ListModal must compose the official shadcn ${component} directly`);
}
assert(/<DrawerClose\b/.test(listModalSource), "ListModal must render an explicit DrawerClose action (the shadcn Drawer has no built-in close button)");
assert(/<Drawer open\b[^>]*onOpenChange=\{\(open\) => \{ if \(!open && !loading && !deleting\) onClose\(\); \}\}/.test(listModalSource), "ListModal must keep its Drawer close guard while saving or deleting");
assert(/<DrawerContent\b[^>]*finalFocus=\{returnFocusRef\}/.test(listModalSource), "ListModal DrawerContent must restore focus to its opener");
assert(!/<Select\b|<SelectTrigger\b/.test(listModalSource), "ListModal must not restore the multi-option privacy Select");
assert(!listModalSource.includes("Кто увидит"), "ListModal must not restore the retired privacy label");
assert(/>Секретный список<\//.test(listModalSource), "ListModal must label its privacy switch as Секретный список");
assert(/checked=\{form\.privacy === "private"\}/.test(listModalSource), "ListModal switch must reflect private-list state");
assert(/privacy: checked \? "private" : "public"/.test(listModalSource), "ListModal switch must map directly to private/public privacy");
const wishModalSource = app.slice(app.indexOf("function WishModal"), app.indexOf("function FriendsPage"));
const primaryWishEditorDialog = wishModalSource.slice(wishModalSource.indexOf("const fieldId"), wishModalSource.indexOf("{listCreatorOpen &&"));
assert(/<section\b[^>]*className="wish-editor-screen"[^>]*role="dialog"[^>]*aria-modal="true"/.test(primaryWishEditorDialog), "WishModal must render as a standalone fullscreen dialog section");
assert(!/<Modal\b/.test(primaryWishEditorDialog), "WishModal must not wrap its primary editor in the legacy Modal adapter");
assert(!/<Drawer(?:Content|Close|Header|Title|Description|Footer)?\b/.test(primaryWishEditorDialog), "WishModal fullscreen editor must not use Drawer components");
assert(!/<DialogClose\b/.test(primaryWishEditorDialog), "WishModal must use DrawerClose instead of the retired DialogClose");
assert(!/viewportClassName=/.test(primaryWishEditorDialog), "WishModal must use the native shadcn Drawer overlay and positioning");
assert(!/showCloseButton=/.test(primaryWishEditorDialog), "WishModal must not re-enable the retired Dialog close API");
assert(!/modal(?:-backdrop)?--wish-editor/.test(primaryWishEditorDialog), "WishModal must not restore the legacy fullscreen editor shell");
assert(/className="wish-editor-screen__close"[^>]*onClick=\{requestClose\}/.test(primaryWishEditorDialog), "WishModal must keep its requestClose-guarded close action");
assert(
  !/<Tabs\b/.test(app) || /<TabsContent\b/.test(app),
  "Tabs must render associated TabsContent panels; use ToggleGroup for filters and route selectors",
);

const sourceFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(target);
    else if (/\.(?:css|[cm]?[jt]sx?)$/.test(entry.name)) sourceFiles.push(target);
  }
}
await collect(path.join(root, "src"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const relativeFile = path.relative(root, file);
  assert(!source.includes("@radix-ui/"), `Base Nova source must not import Radix: ${relativeFile}`);
  assert(!source.includes("shadcn.css"), `Legacy shadcn.css must not be referenced: ${relativeFile}`);
  if (!file.startsWith(`${uiDir}${path.sep}`)) {
    assert(!source.includes("@base-ui/react"), `Base UI must only be imported by owned shadcn components: ${relativeFile}`);
  }
  if (file.startsWith(`${uiDir}${path.sep}`)) continue;
  for (const match of source.matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)(px|rem)/g)) {
    const pixels = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
    assert(pixels === 0 || pixels >= 13, `${relativeFile} declares a font size below 13px: ${match[0]}`);
  }
  for (const match of source.matchAll(/\btext-\[([0-9]*\.?[0-9]+)(px|rem)\]/g)) {
    const pixels = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
    assert(pixels === 0 || pixels >= 13, `${relativeFile} declares a Tailwind font size below 13px: ${match[0]}`);
  }
}

console.log(`Strict shadcn audit passed (${requiredUiFiles.length} required UI components).`);
