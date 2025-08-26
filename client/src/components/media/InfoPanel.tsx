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
  // If no data, don't render anything
  if (!data) {
    return null;
  }

  const { theme, nombre_d_indices, score_globale } = data;

  return (
    <Card className="mx-6 mb-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
      <div className="flex items-center justify-between gap-4">
        {/* Theme section */}
        {theme && (
          <div className="flex items-center gap-2 flex-1">
            <Target className="w-5 h-5 text-blue-600" />
            <div>
              <span className="text-sm font-medium text-gray-700">Thématique actuelle :</span>
              <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-800 font-medium">
                {theme}
              </Badge>
            </div>
          </div>
        )}

        {/* Indices section */}
        {nombre_d_indices && (
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-green-600" />
            <div className="text-center">
              <div className="text-xs text-gray-600">Indices trouvés</div>
              <div className="text-lg font-bold text-green-700">{nombre_d_indices}</div>
            </div>
          </div>
        )}

        {/* Score section */}
        {score_globale !== undefined && score_globale !== null && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            <div className="text-center">
              <div className="text-xs text-gray-600">Score global</div>
              <div className="text-xl font-bold text-orange-700">{score_globale}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}