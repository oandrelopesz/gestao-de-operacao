import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Star, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/nps")({
  component: NPSPage,
});

function NPSPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS de Clientes</h1>
          <p className="text-muted-foreground">Monitore a satisfação e colete feedbacks.</p>
        </div>
        <Button className="gap-2">
          <Plus size={16} />
          Registrar pesquisa
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>NPS Geral</CardTitle>
            <CardDescription>Net Promoter Score calculado</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-2">
            <div className="text-6xl font-bold text-primary mb-2">0</div>
            <p className="text-sm font-medium text-muted-foreground">Ainda sem dados suficientes</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribuição de Notas</CardTitle>
            <CardDescription>Promotores, Neutros e Detratores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  Promotores (9-10)
                </span>
                <span className="font-medium">0%</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  Neutros (7-8)
                </span>
                <span className="font-medium">0%</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive" />
                  Detratores (0-6)
                </span>
                <span className="font-medium">0%</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Últimos Feedbacks</h3>
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30">
          <MessageSquare size={32} className="text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Nenhum feedback ainda</h3>
          <p className="text-muted-foreground">Registre sua primeira pesquisa de satisfação.</p>
        </div>
      </div>
    </div>
  );
}
