import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { Mascot } from "./components/Mascot";
import "./assets/main.css";

const isMascotWindow = window.location.hash.startsWith("#mascot");
if (isMascotWindow) {
  document.body.classList.add("mascot-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isMascotWindow ? <Mascot /> : <App />}</React.StrictMode>,
);
