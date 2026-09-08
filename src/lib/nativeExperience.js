const editableSelector = "input, textarea, [contenteditable='true']";

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
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
}
