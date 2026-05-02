import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopValidator } from "./components/layout/DesktopValidator";
import { Header } from "./components/layout/Header";
import { RectifyWidget } from "./components/integrations/RectifyWidget";
import Homepage from "./pages/homepage";
import About from "./pages/about";
import NotFound from "./pages/not-found";
import DebugPage from "./pages/debug";
import { analytics } from "./lib/analytics";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

function MainApp() {
  const [showAbout, setShowAbout] = useState(false);
  const [infoData, setInfoData] = useState<InfoPanelData | null>(null);

  useEffect(() => {
    analytics.trackPageView('homepage');
  }, []);

  return (
    <DesktopValidator>
      <div className="h-full flex flex-col">
        <Header
          onAboutClick={() => setShowAbout(true)}
          infoData={infoData}
        />

        <Switch>
          <Route path="/">
            <Homepage onInfoDataUpdate={setInfoData} />
          </Route>
          <Route component={NotFound} />
        </Switch>

        {showAbout && (
          <About onClose={() => setShowAbout(false)} />
        )}
      </div>
    </DesktopValidator>
  );
}

/**
 * Listens for `?debug` (or `?debug=1`) in the URL and redirects to /debug.
 * Lets users open the debug console from any URL by appending the query.
 */
function DebugQueryRedirect() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (location === "/debug") return;
    const search = typeof window !== "undefined" ? window.location.search : "";
    if (/[?&]debug(=|&|$)/.test(search)) {
      setLocation("/debug");
    }
  }, [location, setLocation]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <DebugQueryRedirect />
        <Switch>
          {/* Debug route: bypasses DesktopValidator + RectifyWidget so it's
              usable on any device, even when something is broken in the app. */}
          <Route path="/debug">
            <DebugPage />
          </Route>
          <Route>
            <RectifyWidget />
            <MainApp />
          </Route>
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
