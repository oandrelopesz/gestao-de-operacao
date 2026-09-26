// Janela "Exportar leads": escolhe o recorte (todos, os da tela, uma coluna ou os selecionados), o formato (CSV,
// Excel ou PDF) e se o histórico vai junto. Gera o arquivo no navegador e baixa.
import { useEffect, useId, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCrm } from "@/components/crm/CrmContexto";
import { useAgencias } from "@/lib/agencias";
import type { LeadCrm } from "@/lib/crmTipos";
import {
  montarPlanilhaHistorico, montarPlanilhaLeads, montarResumo, nomeArquivo, type EscopoExport,
} from "@/lib/crmExport";
import { gerarCsv } from "@/lib/exportCsv";
import { gerarXlsx } from "@/lib/exportXlsx";
import { gerarPdfCrm } from "@/lib/crmPdf";

type Formato = "xlsx" | "csv" | "pdf";
type TipoEscopo = EscopoExport["tipo"];

const FORMATOS: { id: Formato; rotulo: string; ajuda: string; icone: typeof Sheet }[] = [
  { id: "xlsx", rotulo: "Excel (XLSX)", ajuda: "Abas Leads, Histórico e Resumo por coluna", icone: FileSpreadsheet },
  { id: "csv", rotulo: "CSV", ajuda: "Um lead por linha; o histórico vem num segundo arquivo", icone: Sheet },
  { id: "pdf", rotulo: "PDF", ajuda: "Resumo na capa e uma ficha completa por lead", icone: FileText },
];

function baixar(nome: string, dados: string | Uint8Array, tipo: string) {
  const url = URL.createObjectURL(new Blob([dados as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ExportarDialog({ filtrados }: { filtrados: LeadCrm[] }) {
  const { exportacao, abrirExportacao, colunas, leads, eventos, colunaDoLead } = useCrm();
  const { agencias } = useAgencias();
  const id = useId();
  const [tipo, setTipo] = useState<TipoEscopo>("todos");
  const [colunaId, setColunaId] = useState("");
  const [formato, setFormato] = useState<Formato>("xlsx");
  const [historico, setHistorico] = useState(true);
  const [gerando, setGerando] = useState(false);
  const selecionados = exportacao?.tipo === "selecionados" ? exportacao.ids : [];

  // Cada abertura começa no recorte de onde veio (topo, coluna ou seleção)
  useEffect(() => {
    if (!exportacao) return;
    setTipo(exportacao.tipo);
    setColunaId(exportacao.tipo === "coluna" ? exportacao.colunaId : colunas[0]?.id ?? "");
  }, [exportacao, colunas]);

  const porColuna = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(colunaDoLead(l).id, (m.get(colunaDoLead(l).id) ?? 0) + 1);
    return m;
  }, [leads, colunaDoLead]);

  const recorte = useMemo((): { lista: LeadCrm[]; rotulo: string; arquivo: string } => {
    switch (tipo) {
      case "filtrados":
        return { lista: filtrados, rotulo: "Leads da tela (filtros atuais)", arquivo: "filtrados" };
      case "coluna": {
        const c = colunas.find((x) => x.id === colunaId);
        return { lista: leads.filter((l) => colunaDoLead(l).id === colunaId), rotulo: `Coluna ${c?.titulo ?? ""}`, arquivo: c?.titulo ?? "coluna" };
      }
      case "selecionados": {
        const ids = new Set(selecionados);
        return { lista: leads.filter((l) => ids.has(l.id)), rotulo: "Leads selecionados", arquivo: "selecionados" };
      }
      default:
        return { lista: leads, rotulo: "Todos os leads", arquivo: "todos" };
    }
  }, [tipo, colunaId, filtrados, leads, colunas, colunaDoLead, selecionados]);

  const exportar = async () => {
    const { lista, rotulo, arquivo } = recorte;
    if (!lista.length) return;
    setGerando(true);
    // Deixa a janela mostrar "Gerando…" antes do trabalho pesado
    await new Promise((r) => setTimeout(r, 30));
    try {
      const agora = new Date();
      const mapaAgencias = new Map(agencias.map((a) => [a.id, a.label]));
      const ids = new Set(lista.map((l) => l.id));
      const evs = eventos.filter((e) => ids.has(e.lead_id));
      if (formato === "pdf") {
        const pdf = gerarPdfCrm({ leads: lista, colunas, eventos: evs, agora, agencias: mapaAgencias, incluirHistorico: historico, escopo: rotulo });
        baixar(nomeArquivo(arquivo, "pdf", agora), pdf, "application/pdf");
      } else {
        const { planilha } = montarPlanilhaLeads(lista, colunas, evs, agora, mapaAgencias);
        if (formato === "xlsx") {
          const abas = [{ nome: "Leads", planilha, filtro: true }];
          if (historico) abas.push({ nome: "Histórico", planilha: montarPlanilhaHistorico(lista, evs, colunas), filtro: true });
          abas.push({ nome: "Resumo por coluna", planilha: montarResumo(lista, colunas), filtro: false });
          baixar(nomeArquivo(arquivo, "xlsx", agora), gerarXlsx(abas), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else {
          baixar(nomeArquivo(arquivo, "csv", agora), gerarCsv(planilha), "text/csv;charset=utf-8");
          if (historico) {
            // Segundo download um instante depois (alguns navegadores barram dois cliques seguidos)
            const csvHistorico = gerarCsv(montarPlanilhaHistorico(lista, evs, colunas));
            setTimeout(() => baixar(nomeArquivo(`${arquivo}-historico`, "csv", agora), csvHistorico, "text/csv;charset=utf-8"), 600);
          }
        }
      }
      toast.success(`${lista.length} ${lista.length === 1 ? "lead exportado" : "leads exportados"} (${formato.toUpperCase()}).`);
      abrirExportacao(null);
    } catch (e: any) {
      toast.error("Não foi possível exportar: " + (e?.message ?? String(e)));
    } finally {
      setGerando(false);
    }
  };

  const opcoes: { id: TipoEscopo; rotulo: string; qtd: number }[] = [
    { id: "todos", rotulo: "Todos os leads (ignora os filtros)", qtd: leads.length },
    { id: "filtrados", rotulo: "Os que estão na tela (com período, etiqueta e busca)", qtd: filtrados.length },
    { id: "coluna", rotulo: "Uma coluna (todos os leads dela)", qtd: porColuna.get(colunaId) ?? 0 },
    ...(selecionados.length ? [{ id: "selecionados" as const, rotulo: "Os selecionados", qtd: selecionados.length }] : []),
  ];

  return (
    <Dialog open={!!exportacao} onOpenChange={(v) => !v && !gerando && abrirExportacao(null)}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar leads</DialogTitle>
          <DialogDescription>
            Sai tudo de cada lead: dados, coluna e etapa, tentativas, reunião, pontos de contato, valores, jornada, UTMs e
            notas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label>O que exportar</Label>
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoEscopo)} className="gap-2.5">
              {opcoes.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <RadioGroupItem value={o.id} id={`${id}-${o.id}`} />
                  <Label htmlFor={`${id}-${o.id}`} className="cursor-pointer font-normal">
                    {o.rotulo} <span className="text-muted-foreground tabular-nums">· {o.qtd}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {tipo === "coluna" && (
              <Select value={colunaId} onValueChange={setColunaId}>
                <SelectTrigger className="mt-1" aria-label="Coluna">
                  <SelectValue placeholder="Escolha a coluna" />
                </SelectTrigger>
                <SelectContent>
                  {colunas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} aria-hidden />
                        {c.titulo} <span className="text-muted-foreground tabular-nums">· {porColuna.get(c.id) ?? 0}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Formato</Label>
            <RadioGroup value={formato} onValueChange={(v) => setFormato(v as Formato)} className="grid gap-2 sm:grid-cols-3">
              {FORMATOS.map((f) => (
                <Label
                  key={f.id}
                  htmlFor={`${id}-f-${f.id}`}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <RadioGroupItem value={f.id} id={`${id}-f-${f.id}`} />
                    <f.icone size={15} className="text-muted-foreground" /> {f.rotulo}
                  </span>
                  <span className="text-xs text-muted-foreground">{f.ajuda}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex items-start gap-3">
            <Switch id={`${id}-hist`} checked={historico} onCheckedChange={setHistorico} />
            <Label htmlFor={`${id}-hist`} className="cursor-pointer font-normal leading-snug">
              Incluir o histórico completo
              <span className="block text-xs text-muted-foreground">
                Todas as mudanças de coluna, tentativas, pontos de contato, reuniões, notas e ações de cada lead.
              </span>
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => abrirExportacao(null)} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={exportar} disabled={gerando || recorte.lista.length === 0} className="gap-1.5">
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {gerando
              ? "Gerando…"
              : recorte.lista.length === 0
                ? "Nenhum lead neste recorte"
                : `Exportar ${recorte.lista.length} ${recorte.lista.length === 1 ? "lead" : "leads"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
