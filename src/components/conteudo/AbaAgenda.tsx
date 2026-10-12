// Pilares (temas em rodízio) e agenda da semana do cliente: dia, horário e formato.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderSync, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { pilaresDoCofre, salvarCliente, type ClienteConteudo } from "@/lib/conteudo";
import { DIAS_CURTOS, HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import { ROTULO_FORMATO, type Formato, type ItemAgenda, type Pilar } from "../../../supabase/functions/conteudo/regras.ts";

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function AbaAgenda({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [pilares, setPilares] = useState<Pilar[]>(cliente.pilares);
  const [agenda, setAgenda] = useState<ItemAgenda[]>(cliente.agenda);
  const [salvando, setSalvando] = useState(false);
  const [puxando, setPuxando] = useState(false);
  useEffect(() => { setPilares(cliente.pilares); setAgenda(cliente.agenda); }, [cliente.id]);
  const item = (dia: number) => agenda.find((a) => a.dia === dia);
  const mudar = (dia: number, parcial: Partial<ItemAgenda> | null) => setAgenda((atual) =>
    parcial === null ? atual.filter((a) => a.dia !== dia)
      : atual.some((a) => a.dia === dia) ? atual.map((a) => (a.dia === dia ? { ...a, ...parcial } : a))
      : [...atual, { dia, hora: "09:00", formato: "carrossel", ...parcial }]);

  async function puxarPilares() {
    setPuxando(true);
    try {
      const r = await pilaresDoCofre(cliente.id);
      setPilares(r.pilares);
      toast.success(r.origem === "nota" ? `Pilares copiados de ${r.nota?.split("/").pop()}.` : "Pilares montados pela IA a partir do cofre. Revise e ajuste se quiser.");
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPuxando(false);
    }
  }

  async function salvar() {
    const limpos = pilares.map((p) => ({ nome: p.nome.trim(), descricao: p.descricao.trim() })).filter((p) => p.nome);
    if (new Set(limpos.map((p) => p.nome.toLowerCase())).size !== limpos.length) { toast.error("Há pilares com o mesmo nome."); return; }
    setSalvando(true);
    try {
      await salvarCliente(cliente.id, { pilares: limpos, agenda: [...agenda].sort((a, b) => ORDEM_DIAS.indexOf(a.dia) - ORDEM_DIAS.indexOf(b.dia)) });
      toast.success("Pilares e agenda salvos.");
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Pilares (a IA escolhe os temas dentro deles, em rodízio)</h3>
          <Button variant="ghost" size="sm" onClick={puxarPilares} disabled={puxando || !cliente.pasta_cofre}>
            {puxando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderSync className="mr-1 h-4 w-4" />}Puxar pilares do cofre
          </Button>
        </div>
        {pilares.map((p, i) => (
          <div key={i} className="flex gap-2 rounded-md border p-2">
            <div className="flex-1 space-y-1">
              <Input placeholder="Nome (ex.: Dica)" value={p.nome} onChange={(e) => setPilares(pilares.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
              <Textarea rows={2} placeholder="Descrição: o que entra neste pilar" value={p.descricao} onChange={(e) => setPilares(pilares.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
            </div>
            <Button variant="ghost" size="icon" aria-label={`Remover pilar ${p.nome || i + 1}`} onClick={() => setPilares(pilares.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setPilares([...pilares, { nome: "", descricao: "" }])}><Plus className="mr-1 h-4 w-4" />Adicionar pilar</Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Agenda da semana</h3>
        {ORDEM_DIAS.map((dia) => {
          const a = item(dia);
          return (
            <div key={dia} className="flex flex-wrap items-center gap-2">
              <label className="flex w-20 items-center gap-2 text-sm"><Switch checked={!!a} onCheckedChange={(v) => mudar(dia, v ? {} : null)} />{DIAS_CURTOS[dia]}</label>
              {a && (
                <>
                  <Select value={a.hora} onValueChange={(v) => mudar(dia, { hora: v })}>
                    <SelectTrigger className="w-24" aria-label={`Horário de ${DIAS_CURTOS[dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{HORARIOS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={a.formato} onValueChange={(v) => mudar(dia, { formato: v as Formato })}>
                    <SelectTrigger className="w-32" aria-label={`Formato de ${DIAS_CURTOS[dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{(["carrossel", "estatico"] as Formato[]).map((f) => <SelectItem key={f} value={f}>{ROTULO_FORMATO[f]}</SelectItem>)}</SelectContent>
                  </Select>
                </>
              )}
            </div>
          );
        })}
      </section>

      <Button onClick={salvar} disabled={salvando}>Salvar pilares e agenda</Button>
    </div>
  );
}
