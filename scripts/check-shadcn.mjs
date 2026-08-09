import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [configText, packageText, app, theme, legacyStyles, html, main, vite, jsconfigText] = await Promise.all([
  read("components.json"),
  read("package.json"),
  read("src/App.jsx"),
  read("src/index.css"),
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
assert.match(legacyStyles, /--text-caption:\s*13px;/, "The smallest legacy caption token must be 13px");

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
const logoSource = app.slice(app.indexOf("function Logo"), app.indexOf("function Avatar"));
assert.match(logoSource, /aria-label="Rollapp — в приложение"/, "The mark-only logo must keep its accessible name");
assert.match(logoSource, /<svg[\s\S]*className="logo__mark"/, "Logo must render the vector mark as inline SVG");
assert.match(logoSource, /fill="currentColor"/, "The vector logo must inherit the surrounding foreground color");
assert.match(logoSource, /fillRule="evenodd"/, "The vector logo must preserve its transparent square cutout");
assert.doesNotMatch(logoSource, /<(?:img|image|foreignObject)\b/, "The vector logo must not embed a raster image");
assert.doesNotMatch(logoSource, /<span\b|className="logo__word"|>\s*rollapp\s*</i, "Logo must render only the vector mark, without a visible wordmark");
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

const largeButtonSource = await readFile(path.join(uiDir, "button.jsx"), "utf8");
const largeInputSource = await readFile(path.join(uiDir, "input.jsx"), "utf8");
const largeSelectSource = await readFile(path.join(uiDir, "select.jsx"), "utf8");
const largeSwitchSource = await readFile(path.join(uiDir, "switch.jsx"), "utf8");
const largeDropdownSource = await readFile(path.join(uiDir, "dropdown-menu.jsx"), "utf8");
assert(/size = "lg"/.test(largeButtonSource) && /lg: "h-12\b/.test(largeButtonSource), "Button must default to the 48px Large size");
assert(/icon: "size-12"/.test(largeButtonSource) && /data-size=\{size\}/.test(largeButtonSource), "Icon buttons must expose and use the 48px Large size");
assert(/"h-12 w-full/.test(largeInputSource) && /text-base/.test(largeInputSource), "Input must use the 48px Large geometry and 16px text");
assert(/size = "lg"/.test(largeSelectSource) && /data-\[size=lg\]:h-12/.test(largeSelectSource), "SelectTrigger must default to the 48px Large size");
assert(/min-h-12/.test(largeSelectSource) && /text-base/.test(largeSelectSource), "Select options must use Large rows");
assert(/data-\[size=default\]:h-6/.test(largeSwitchSource) && /data-\[size=default\]:w-11/.test(largeSwitchSource), "Switch must use the Large 44x24 track");
assert((largeDropdownSource.match(/min-h-12/g) || []).length >= 4, "Dropdown menu controls must use Large rows");

for (const component of [
  "avatar",
  "badge",
  "button",
  "card",
  "dialog",
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
for (const component of ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "ScrollArea", "DialogFooter", "FieldGroup"]) {
  assert(new RegExp(`<${component}\\b`).test(profileSettingsSource), `ProfileSettingsModal must compose the official shadcn ${component} directly`);
}
assert(!/<Modal\b/.test(profileSettingsSource), "ProfileSettingsModal must not use the legacy Modal adapter");
assert(!/<DialogClose\b/.test(profileSettingsSource), "ProfileSettingsModal must use the native DialogContent close action");
assert(!/viewportClassName=|showCloseButton=|ariaLabel=/.test(profileSettingsSource), "ProfileSettingsModal must use the native shadcn dialog shell");
assert(!/modal-(?:backdrop|heading|actions)|data-modal-initial-focus|settings-editor/.test(profileSettingsSource), "ProfileSettingsModal must not restore legacy modal hooks");
assert(/<Dialog open onOpenChange=/.test(profileSettingsSource), "ProfileSettingsModal must keep the native Dialog controlled");
assert(/finalFocus=\{finalFocus\}/.test(profileSettingsSource), "ProfileSettingsModal must restore focus to its opener");
assert(/<DialogTitle>Изменить профиль<\/DialogTitle>/.test(profileSettingsSource), "ProfileSettingsModal must expose its visible title through DialogTitle");
assert(/<form\b[^>]*onSubmit=\{submit\}/.test(profileSettingsSource), "ProfileSettingsModal must keep one native form submission path");
assert(!/Ссылка на фото|settings-profile-avatar-url/.test(profileSettingsSource), "ProfileSettingsModal must not expose the retired avatar URL field");
assert(!/sm:max-w-2xl/.test(profileSettingsSource) && /max-h-\[min\(calc\(100dvh-2rem\),44rem\)\]/.test(profileSettingsSource), "ProfileSettingsModal must use the viewport-wide shadcn dialog geometry");
const [dialogSource, alertDialogSource] = await Promise.all([
  read("src/components/ui/dialog.jsx"),
  read("src/components/ui/alert-dialog.jsx"),
]);
assert(/w-full max-w-none/.test(dialogSource), "DialogContent must fill the viewport width without a max-width cap");
assert(!/max-w-\[calc\(100%-2rem\)\]|sm:max-w-sm/.test(dialogSource), "DialogContent must not restore compact width caps");
assert(/w-full max-w-none/.test(alertDialogSource), "AlertDialogContent must fill the viewport width without a max-width cap");
assert(!/max-w-xs|sm:max-w-sm/.test(alertDialogSource), "AlertDialogContent must not restore compact width caps");
assert(/\.modal-backdrop\s*\{[^}]*padding:\s*25px 0;/.test(legacyStyles), "Legacy modal backdrops must not reserve horizontal gutters");
assert(/\.modal\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/.test(legacyStyles), "Legacy modal surfaces must fill the viewport width");
const appProfileButtonSource = app.slice(app.indexOf("function AppProfileButton"), app.indexOf("function FriendsTopbar"));
assert(/<ShadcnButton\b/.test(appProfileButtonSource), "AppProfileButton must use the official shadcn Button");
assert(/type="button"/.test(appProfileButtonSource) && /onClick=\{openProfileEditor\}/.test(appProfileButtonSource), "AppProfileButton must open profile editing in place");
assert(!/<(?:Link|NavLink)\b/.test(appProfileButtonSource), "AppProfileButton must not navigate away from the current screen");
const wishesProfileHeroSource = app.slice(app.indexOf("function WishesProfileHero"), app.indexOf("function ProtectedApp"));
assert(/<button\b/.test(wishesProfileHeroSource) && /type="button"/.test(wishesProfileHeroSource), "WishesProfileHero must expose a native profile button");
assert(/onClick=\{openProfileEditor\}/.test(wishesProfileHeroSource), "WishesProfileHero must open profile editing in place");
const wishDetailsSource = app.slice(app.indexOf("function WishDetailsModal"), app.indexOf("function ListModal"));
const primaryWishDetailsDialog = wishDetailsSource.slice(0, wishDetailsSource.indexOf("{deleteOpen &&"));
for (const component of ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"]) {
  assert(new RegExp(`<${component}\\b`).test(primaryWishDetailsDialog), `WishDetailsModal must compose the official shadcn ${component} directly`);
}
assert(!/<Modal\b/.test(primaryWishDetailsDialog), "WishDetailsModal must not wrap its primary detail view in the legacy Modal adapter");
assert(!/<DialogClose\b/.test(primaryWishDetailsDialog), "WishDetailsModal must use the native shadcn DialogContent close action");
assert(!/viewportClassName=/.test(primaryWishDetailsDialog), "WishDetailsModal must use the native shadcn Dialog overlay and positioning");
assert(!/showCloseButton=/.test(primaryWishDetailsDialog), "WishDetailsModal must keep the native shadcn Dialog close action enabled");
const primaryWishDetailsContentTag = primaryWishDetailsDialog.match(/<DialogContent\b[^>]*>/)?.[0] || "";
assert(primaryWishDetailsContentTag === "<DialogContent>", "WishDetailsModal must use the base shadcn DialogContent shell without custom classes or adapters");
const wishMediaTag = primaryWishDetailsDialog.match(/<Card\b[^>]*data-slot="wish-media"[^>]*>/)?.[0] || "";
const wishMediaImageTag = primaryWishDetailsDialog.match(/<img\b[^>]*className="[^"]*"[^>]*>/)?.[0] || "";
assert(wishMediaTag && !/aspect-\[/.test(wishMediaTag), "WishDetailsModal must not force photos into a fixed aspect ratio");
assert(/\bw-full\b/.test(wishMediaImageTag) && /\bh-auto\b/.test(wishMediaImageTag), "WishDetailsModal photos must fill the container width and keep their intrinsic height");
const listModalSource = app.slice(app.indexOf("function ListModal"), app.indexOf("function WishModal"));
for (const component of ["Field", "FieldLabel", "FieldDescription", "Switch"]) {
  assert(new RegExp(`<${component}\\b`).test(listModalSource), `ListModal must compose the secret-list control with shadcn ${component}`);
}
assert(!/<Select\b|<SelectTrigger\b/.test(listModalSource), "ListModal must not restore the multi-option privacy Select");
assert(!listModalSource.includes("Кто увидит"), "ListModal must not restore the retired privacy label");
assert(/>Секретный список<\//.test(listModalSource), "ListModal must label its privacy switch as Секретный список");
assert(/checked=\{form\.privacy === "private"\}/.test(listModalSource), "ListModal switch must reflect private-list state");
assert(/privacy: checked \? "private" : "public"/.test(listModalSource), "ListModal switch must map directly to private/public privacy");
const wishModalSource = app.slice(app.indexOf("function WishModal"), app.indexOf("function FriendsPage"));
const primaryWishEditorDialog = wishModalSource.slice(wishModalSource.indexOf("const fieldId"), wishModalSource.indexOf("{listCreatorOpen &&"));
for (const component of ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"]) {
  assert(new RegExp(`<${component}\\b`).test(primaryWishEditorDialog), `WishModal must compose the official shadcn ${component} directly`);
}
assert(!/<Modal\b/.test(primaryWishEditorDialog), "WishModal must not wrap its primary editor in the legacy Modal adapter");
assert(!/<DialogClose\b/.test(primaryWishEditorDialog), "WishModal must use the native shadcn DialogContent close action");
assert(!/viewportClassName=/.test(primaryWishEditorDialog), "WishModal must use the native shadcn Dialog overlay and positioning");
assert(!/showCloseButton=/.test(primaryWishEditorDialog), "WishModal must keep the native shadcn Dialog close action enabled");
assert(!/modal(?:-backdrop)?--wish-editor/.test(primaryWishEditorDialog), "WishModal must not restore the legacy fullscreen editor shell");
const primaryWishEditorContentTag = primaryWishEditorDialog.match(/<DialogContent\b[^>]*>/)?.[0] || "";
assert(primaryWishEditorContentTag === "<DialogContent>", "WishModal must use the base shadcn DialogContent shell without custom classes or adapters");
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
