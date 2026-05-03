import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPostHog } from "./lib/posthog";
import { analytics } from "./lib/analytics";

initPostHog();

window.onerror = (message, _source, _lineno, _colno, error) => {
  try {
    analytics.trackError({
      component: "unhandled",
      errorType: error?.name || "UnknownError",
      message: typeof message === "string" ? message : String(message),
    });
  } catch {}
  return false;
};

window.addEventListener("unhandledrejection", (event) => {
  try {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection");
    const errorType = reason instanceof Error ? reason.name : "UnhandledRejection";
    analytics.trackError({
      component: "unhandled",
      errorType,
      message,
    });
  } catch {}
});

createRoot(document.getElementById("root")!).render(<App />);
