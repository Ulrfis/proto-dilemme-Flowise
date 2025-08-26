import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Target, TrendingUp, Search } from "lucide-react";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface InfoPanelProps {
  data?: InfoPanelData | null;
}

export function InfoPanel({ data }: InfoPanelProps) {
  // Use default values if no data is provided
  const theme = data?.theme || "à spécifier";
  const score = data?.score_globale || "à venir";
  const indices = data?.nombre_d_indices || "0";

  console.log('[InfoPanel] Rendering with data:', data);

  return (
    <div className="mx-6 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-center gap-6 text-sm font-medium text-blue-900">
        <div className="flex items-center gap-2">
          <span>Thématique :</span>
          <span className="font-semibold">{theme}</span>
        </div>
        <div className="text-blue-400">|</div>
        <div className="flex items-center gap-2">
          <span>Indices :</span>
          <span className="font-semibold">{indices}</span>
        </div>
        <div className="text-blue-400">|</div>
        <div className="flex items-center gap-2">
          <span>Score :</span>
          <span className="font-semibold">{score}</span>
        </div>
      </div>
    </div>
  );
}