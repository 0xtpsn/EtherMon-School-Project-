import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";
import { SessionProvider } from "./context/SessionContext";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="artspace-ui-theme">
    <SessionProvider>
      <App />
    </SessionProvider>
  </ThemeProvider>
);
