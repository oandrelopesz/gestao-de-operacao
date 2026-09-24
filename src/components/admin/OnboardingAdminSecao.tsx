import { Layers, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfig } from "@/lib/appConfig";
import { TemplatesView } from "@/components/processos/TemplatesView";

const JANELAS = [
  { valor: 0, label: "Hoje" },
  { valor: 1, label: "Amanhã" },
  { valor: 2, label: "Depois de amanhã" },
];

/** Seção "Onboarding" do Admin: templates e regras de envio dos passos para Demandas. */
export function OnboardingAdminSecao() {
  const [janela, salvarJanela, carregandoJanela] = useConfig<number>("onboarding_janela_dias", 2);
  const [ativaTrafego, salvarAtivaTrafego, carregandoTrafego] = useConfig<boolean>("onboarding_ativa_trafego", true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send size={18} /> Envio para Demandas</CardTitle>
          <CardDescription>Os passos do onboarding viram demandas no Kanban conforme a data de cada um se aproxima.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <Label htmlFor="onboarding-janela" className="font-normal">Enviar passos com data até</Label>
            <Select
              value={String(janela)}
              disabled={carregandoJanela}
              onValueChange={(v) => { salvarJanela(Number(v)).then(() => toast.success("Configuração salva")).catch(() => toast.error("Erro ao salvar")); }}
            >
              <SelectTrigger id="onboarding-janela" className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JANELAS.map((j) => (
                  <SelectItem key={j.valor} value={String(j.valor)}>{j.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="onboarding-ativa-trafego" className="font-normal leading-snug">
              Ativar tráfego automaticamente ao concluir o onboarding
            </Label>
            <Switch
              id="onboarding-ativa-trafego"
              checked={ativaTrafego}
              disabled={carregandoTrafego}
              onCheckedChange={(v) => { salvarAtivaTrafego(v).catch(() => toast.error("Erro ao salvar")); }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers size={18} /> Templates de onboarding</CardTitle>
          <CardDescription>Os mesmos templates da aba Onboarding.</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplatesView tipo="onboarding" />
        </CardContent>
      </Card>
    </div>
  );
}
