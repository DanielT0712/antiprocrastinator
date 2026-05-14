import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Overlay } from "./Overlay";
import { WarningPopup } from "./WarningPopup";
import "./styles/global.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (view === "overlay") {
  root.render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>,
  );
} else if (view === "popup") {
  root.render(
    <React.StrictMode>
      <WarningPopup />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
