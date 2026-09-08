import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { enableNativeExperience } from "./lib/nativeExperience.js";
import { registerPwa } from "./lib/pwa.js";
import "./styles/global.css";

enableNativeExperience();
registerPwa();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
