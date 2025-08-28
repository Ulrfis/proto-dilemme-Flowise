import { Switch, Route } from "wouter";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopValidator } from "./components/layout/DesktopValidator";
import { Header } from "./components/layout/Header";
import Homepage from "./pages/homepage";
import About from "./pages/about";
import NotFound from "./pages/not-found";
import { analytics } from "./lib/analytics";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

function Router() {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
