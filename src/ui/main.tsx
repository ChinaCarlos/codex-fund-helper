import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

function mount() {
  let root = document.getElementById("root");
  if (!root) {
    root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
  }
  createRoot(root).render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
