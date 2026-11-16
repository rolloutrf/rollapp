import { useLayoutEffect } from "react";
import "../src/styles.css";
import "../src/index.css";
import "./preview.css";

const viewports = Object.fromEntries([
  [320, 568], [390, 844], [390, 400], [768, 900], [820, 900],
  [1024, 768], [1440, 900], [1920, 1080],
].map(([width, height]) => [`v${width}x${height}`, {
  name: `${width} × ${height}`,
  styles: { width: `${width}px`, height: `${height}px` },
  type: width < 768 ? "mobile" : width <= 820 ? "tablet" : "desktop",
}]));

function Theme({ value, children }) {
  useLayoutEffect(() => {
    document.documentElement.lang = "ru";
    document.documentElement.classList.toggle("dark", value === "dark");
    document.documentElement.style.colorScheme = value;
  }, [value]);
  return children;
}

const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input, window.location.href);
  if (/^\/(?:api(?:\/|$)|mcp(?:\/|$)|tonconnect-manifest\.json$)/.test(url.pathname)) {
    return Promise.reject(new Error(`Запрос вне UI-стенда: ${url.pathname}`));
  }
  return originalFetch(input, options);
};

export default {
  initialGlobals: { theme: "dark" },
  globalTypes: {
    theme: {
      description: "Тема интерфейса",
      toolbar: { title: "Тема", icon: "mirror", items: [
        { value: "dark", title: "Тёмная" },
        { value: "light", title: "Светлая" },
      ], dynamicTitle: true },
    },
  },
  decorators: [(Story, { globals, id }) => <Theme value={globals.theme}><Story key={id} /></Theme>],
  parameters: {
    layout: "fullscreen",
    viewport: { options: viewports },
    backgrounds: { disable: true },
    controls: { expanded: true },
    docs: { story: { inline: false, iframeHeight: 640 } },
    options: { storySort: { method: "alphabetical", order: ["РОЛЛАПП", ["Обзор", "Модули", "UI-компоненты"]] } },
  },
};
