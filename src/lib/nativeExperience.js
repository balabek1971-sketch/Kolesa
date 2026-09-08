const editableSelector = "input, textarea, [contenteditable='true']";

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function preventZoom(event) {
  event.preventDefault();
}

export function enableNativeExperience() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  document.documentElement.classList.toggle("is-standalone", standalone);

  document.addEventListener("contextmenu", (event) => {
    if (closestElement(event.target, editableSelector)) return;
    event.preventDefault();
  }, { capture: true });

  document.addEventListener("dragstart", (event) => {
    if (closestElement(event.target, "img, video, a")) event.preventDefault();
  }, { capture: true });

  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { capture: true, passive: false });

  for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(eventName, preventZoom, { capture: true, passive: false });
  }

  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener("keydown", (event) => {
    const zoomKeys = new Set(["+", "-", "=", "0"]);
    if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) event.preventDefault();
  }, { capture: true });
}
