// "Gerar com IA": opcionalmente usa um briefing de Dados internos (.txt no Drive) e pede à função gmn um rascunho.
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { baixarOriginal, listarPasta } from "@/lib/driveLeitura";
import { FORMULARIOS, extensao, formatarDataHora, rotuloDoItem, type FormularioId } from "@/lib/dadosInternos";
import { gerarBriefingIa, traduzErroGmn, type PerfilGmn } from "@/lib/gmn";
import type { Briefing } from "../../../supabase/functions/gmn/regras.ts";

const NENHUM = "__nenhum__";
interface OpcaoBriefing { id: string; rotulo: string; data: number }

export function GerarBriefingDialog({ perfil, aberto, onFechar, onGerado }: {
  perfil: PerfilGmn; aberto: boolean; onFechar: () => void; onGerado: (b: Briefing) => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcaoBriefing[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState(NENHUM);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!aberto || opcoes) return;
    (async () => {
      try {
        const ids: FormularioId[] = ["negocios", "estrategia"];
        const listas = await Promise.all(ids.map(async (fid) => {
          const f = FORMULARIOS.find((x) => x.id === fid)!;
          const itens = await listarPasta(f.pastaId!);
          return itens.filter((i) => extensao(i.name) === "txt").map((i) => {
            const r = rotuloDoItem(i, fid);
            return { id: i.id, rotulo: `${f.pastaNome}: ${r.titulo} (${formatarDataHora(r.data)})`, data: r.data.getTime() };
          });
        }));
        setOpcoes(listas.flat().sort((a, b) => b.data - a.data));
      } catch (e) {
        setErroLista(traduzErroGmn(e));
        setOpcoes([]);
      }
    })();
  }, [aberto, opcoes]);

  async function gerar() {
    setGerando(true);
    try {
      const texto = escolhido === NENHUM ? null : await (await baixarOriginal(escolhido)).text();
      const b = await gerarBriefingIa(perfil.id, texto);
      onGerado(b);
      toast.success("Rascunho do briefing preenchido. Revise e salve.");
      onFechar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !gerando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar briefing com IA</DialogTitle>
          <DialogDescription>
            A IA usa os dados do perfil, o nicho do cliente ligado e, se você escolher, as respostas de um briefing de Dados
            internos. Nada é salvo até você clicar em Salvar briefing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Briefing de Dados internos (opcional)</Label>
          <Select value={escolhido} onValueChange={setEscolhido} disabled={!opcoes || gerando}>
            <SelectTrigger><SelectValue placeholder={opcoes ? "Nenhum" : "Carregando…"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>Nenhum</SelectItem>
              {(opcoes || []).map((o) => <SelectItem key={o.id} value={o.id}>{o.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
          {erroLista && <p className="text-xs text-destructive">Não foi possível listar os briefings: {erroLista}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={gerando}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {gerando ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
