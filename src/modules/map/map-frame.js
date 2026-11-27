import "./map-frame.css";

const container = document.getElementById("map");
const status = document.getElementById("status");
const parentOrigin = window.location.origin;
let apiPromise;
let map;
let markerEntities = [];
let fitted = false;

function post(type, detail = {}) {
  window.parent.postMessage({ source: "rollapp-friend-map", type, ...detail }, parentOrigin);
}

function showStatus(message = "") {
  status.textContent = message;
  status.hidden = !message;
}

function loadApi(apiKey) {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const parameters = new URLSearchParams({ apikey: apiKey, lang: "ru_RU" });
    script.src = `https://api-maps.yandex.ru/v3/?${parameters}`;
    script.async = true;
    script.onload = async () => {
      try { await window.ymaps3.ready; resolve(window.ymaps3); }
      catch (error) { reject(error); }
    };
    script.onerror = () => reject(new Error("Не удалось загрузить API Яндекс Карт"));
    document.head.append(script);
  });
  return apiPromise;
}

function markerElement(marker) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `rollapp-map-marker rollapp-map-marker--${marker.kind}`;
  button.title = marker.title;
  button.setAttribute("aria-label", marker.title);
  if (marker.imageUrl && marker.kind === "friend") {
    const image = document.createElement("img");
    image.src = marker.imageUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(initial(marker.title)));
    button.append(image);
  } else {
    button.append(initial(marker.kind === "place" ? "М" : marker.title));
  }
  button.addEventListener("click", () => post("select", { markerId: marker.id }));
  return button;
}

function initial(title) {
  const element = document.createElement("span");
  element.textContent = String(title || "•").trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "•";
  return element;
}

function fitMarkers(markers) {
  if (!map || !markers.length) return;
  if (markers.length === 1) {
    map.setLocation({ center: markers[0].coordinates, zoom: 14, duration: 300 });
    return;
  }
  const longitudes = markers.map(marker => marker.coordinates[0]);
  const latitudes = markers.map(marker => marker.coordinates[1]);
  map.setLocation({
    bounds: [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ],
    duration: 300,
  });
}

async function render({ apiKey, markers = [], fit = false }) {
  try {
    const ymaps3 = await loadApi(apiKey);
    if (!map) {
      map = new ymaps3.YMap(container, {
        location: { center: [37.6176, 55.7558], zoom: 10 },
        margin: [48, 48, 48, 48],
        theme: "dark",
      });
      map.addChild(new ymaps3.YMapDefaultSchemeLayer());
      map.addChild(new ymaps3.YMapDefaultFeaturesLayer({ zIndex: 1800 }));
    }
    for (const entity of markerEntities) map.removeChild(entity);
    markerEntities = markers.map(marker => {
      const entity = new ymaps3.YMapMarker({ coordinates: marker.coordinates, blockEvents: true }, markerElement(marker));
      map.addChild(entity);
      return entity;
    });
    if (markers.length && (!fitted || fit)) { fitMarkers(markers); fitted = true; }
    showStatus(markers.length ? "" : "Добавьте любимые места или включите геопозицию друзей.");
    post("rendered", { markerCount: markers.length });
  } catch (error) {
    showStatus(error?.message || "Не удалось открыть карту");
    post("error", { message: error?.message || "Не удалось открыть карту" });
  }
}

window.addEventListener("message", event => {
  if (event.origin !== parentOrigin || event.source !== window.parent) return;
  if (event.data?.source !== "rollapp" || event.data?.type !== "friend-map") return;
  const apiKey = typeof event.data.apiKey === "string" ? event.data.apiKey : "";
  if (!apiKey) { showStatus("API Яндекс Карт не настроен"); return; }
  const markers = Array.isArray(event.data.markers)
    ? event.data.markers.filter(marker => Array.isArray(marker?.coordinates) && marker.coordinates.length === 2)
    : [];
  void render({ apiKey, markers, fit: event.data.fit === true });
});

window.addEventListener("beforeunload", () => map?.destroy());
post("ready");
