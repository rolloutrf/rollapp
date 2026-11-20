import assert from "node:assert/strict";
import { parse } from "@babel/parser";

const actionComponents = new Set([
  "button", "Button", "ShadcnButton", "PageActionButton", "AlertDialogAction", "AlertDialogCancel",
  "DrawerClose", "DrawerBack", "DrawerTrigger", "DialogTrigger", "PopoverTrigger",
  "DropdownMenuTrigger", "Toggle", "ToggleGroupItem", "TabsTrigger", "InputGroupButton",
]);
const iconContent = 1;
const textContent = 2;

function visit(node, callback) {
  if (!node || typeof node.type !== "string") return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, callback));
    else visit(value, callback);
  }
}

function attribute(element, name) {
  return element.attributes.find(attr => attr.name?.name === name);
}

function subtrees(children, icons) {
  let states = [0];
  for (const child of children) {
    const next = content(child, icons);
    states = [...new Set(states.flatMap(existing => next.map(state => existing | state)))];
  }
  return states;
}

function content(node, icons) {
  switch (node.type) {
    case "JSXElement": {
      const { openingElement } = node;
      const name = openingElement.name.name;
      if (attribute(openingElement, "className")?.value?.value?.split(/\s+/).includes("sr-only")) return [0];
      if (icons.has(name) || /(?:Icon|Logo|Mark|Brand|Wordmark)$/.test(name ?? "")) return [iconContent];
      return subtrees(node.children, icons);
    }
    case "JSXFragment":
      return subtrees(node.children, icons);
    case "JSXExpressionContainer":
      return content(node.expression, icons);
    case "ConditionalExpression":
      return [...content(node.consequent, icons), ...content(node.alternate, icons)];
    case "LogicalExpression":
      return node.operator === "&&" ? [0, ...content(node.right, icons)] : [...content(node.left, icons), ...content(node.right, icons)];
    case "JSXText":
    case "StringLiteral":
      return node.value.trim() ? [textContent] : [0];
    case "TemplateLiteral":
    case "Identifier":
    case "MemberExpression":
    case "OptionalMemberExpression":
    case "CallExpression":
    case "NumericLiteral":
      return [textContent];
    default:
      return [0];
  }
}

export function checkActionButtonContent(source, file) {
  const { program } = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const icons = new Set(["svg", "Icon", "Spinner"]);
  const actions = new Set(actionComponents);
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.source.value === "lucide-react") {
      for (const specifier of statement.specifiers) icons.add(specifier.local.name);
    }
    for (const specifier of statement.specifiers) {
      if (actions.has(specifier.imported?.name)) actions.add(specifier.local.name);
    }
  }
  visit(program, node => {
    if (node.type !== "JSXElement") return;
    const { openingElement } = node;
    const tag = openingElement.name.name;
    const attributes = source.slice(openingElement.start, openingElement.end);
    const buttonLink = ["a", "Link", "NavLink"].includes(tag) && /buttonVariants\(|data-slot=["']button["']|role=["']button["']/.test(attributes);
    if (!actions.has(tag) && !buttonLink) return;
    if (attribute(openingElement, "data-content-control") || /\bspace-select\b/.test(attributes)) return;
    assert(!subtrees(node.children, icons).includes(iconContent | textContent),
      `${file}:${node.loc.start.line}: a text action must not render an icon in the same state`);
  });
}
