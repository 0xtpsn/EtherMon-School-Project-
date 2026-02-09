import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";
import { WalletProvider } from "./context/WalletContext";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="artspace-ui-theme">
    <WalletProvider>
      <App />
    </WalletProvider>
  </ThemeProvider>
);
