// "Gerar com IA": opcionalmente usa um briefing de Dados internos (.txt no Drive) e pede à função gmn um rascunho.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ClienteSelect } from "@/components/ClienteSelect";
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
  // Mesma ordem da lista (mais novo primeiro); o rótulo de cada briefing é o texto que a busca procura
  const itensBriefing = useMemo(() => (opcoes ?? []).map((o) => ({ id: o.id, nome: o.rotulo })), [opcoes]);

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
      toast.success("Formulário preenchido com o rascunho da IA. Revise e clique em Salvar contexto.");
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
          <DialogTitle>Gerar dados com IA</DialogTitle>
          <DialogDescription>
            A IA usa os dados salvos do perfil (cliente, saúde, contexto e dados extraídos), o nicho do cliente ligado e, se você
            escolher, as respostas de um briefing de Dados internos. O resultado substitui os dados extraídos do formulário, e
            nada é salvo até você clicar em Salvar contexto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="gmn-briefing-ia">Briefing de Dados internos (opcional)</Label>
          <ClienteSelect
            id="gmn-briefing-ia"
            aria-label="Briefing de Dados internos (opcional)"
            clientes={itensBriefing}
            value={escolhido === NENHUM ? null : escolhido}
            onChange={(id) => setEscolhido(id ?? NENHUM)}
            opcaoVazia="Nenhum"
            ordenar={false}
            textoBusca="Buscar briefing…"
            textoNenhum="Nenhum briefing encontrado."
            disabled={!opcoes || gerando}
          />
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
