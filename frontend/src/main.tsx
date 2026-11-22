import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { getTheme, setTheme } from "./lib/api";
import "./index.css";

setTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
