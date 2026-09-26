// Janela "Colunas": renomear, cor, ordem, tipo, limite de tentativas e motivos; criar e excluir colunas.
// Tudo é editado numa cópia local e só vai para o banco em "Salvar".
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/components/crm/CrmContexto";
import { TIPOS_COLUNA, tetoDa, validarColunas } from "@/lib/crmColunas";
import type { ColunaCrm, TipoColuna } from "@/lib/crmTipos";

interface Linha {
  id: string;
  titulo: string;
  hex: string;
  tipo: TipoColuna;
  /** Texto do campo "Limite de tentativas" (tipos de follow-up) */
  tetoTexto: string;
  /** Texto do campo "Motivos (um por linha)" (perdido/desqualificado) */
  motivosTexto: string;
}

const TIPOS_FOLLOW_UP: TipoColuna[] = ["follow_up", "follow_up_proposta"];
const TIPOS_MOTIVO: TipoColuna[] = ["perdido", "desqualificado"];

const paraLinha = (c: ColunaCrm): Linha => ({
  id: c.id,
  titulo: c.titulo,
  hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : "#64748b",
  tipo: c.tipo,
  tetoTexto: String(tetoDa(c)),
  motivosTexto: (c.config?.motivos ?? []).join("\n"),
});

const descricaoTipo = (t: TipoColuna) => TIPOS_COLUNA.find((x) => x.tipo === t)?.descricao ?? "";

export function ConfigurarColunas({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { colunas, leads, salvarColunas } = useCrm();
  const id = useId();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  /** Colunas com leads marcadas para excluir → coluna de destino dos leads ("" = ainda não escolhida) */
  const [excluindo, setExcluindo] = useState<Record<string, string>>({});
  /** Colunas já gravadas e sem leads que foram excluídas na cópia local */
  const [semLeads, setSemLeads] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Cada abertura começa de uma cópia nova das colunas
  useEffect(() => {
    if (!aberto) return;
    setLinhas(colunas.map(paraLinha));
    setExcluindo({});
    setSemLeads([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const leadsNa = (colunaId: string) => leads.filter((l) => l.coluna_id === colunaId).length;
  const jaGravada = (colunaId: string) => colunas.some((c) => c.id === colunaId);

  const mudar = (colunaId: string, patch: Partial<Linha>) =>
    setLinhas((prev) => prev.map((l) => (l.id === colunaId ? { ...l, ...patch } : l)));

  const mover = (indice: number, delta: number) =>
    setLinhas((prev) => {
      const alvo = indice + delta;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const nova = [...prev];
      [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
      return nova;
    });

  const excluir = (colunaId: string) => {
    // Quem mandava leads para esta coluna precisa escolher outra
    const semEsteDestino = (prev: Record<string, string>) =>
      Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === colunaId ? "" : v]));
    if (leadsNa(colunaId) > 0) {
      setExcluindo((prev) => ({ ...semEsteDestino(prev), [colunaId]: "" }));
      return;
    }
    setLinhas((prev) => prev.filter((l) => l.id !== colunaId));
    if (jaGravada(colunaId)) setSemLeads((prev) => [...prev, colunaId]);
    setExcluindo(semEsteDestino);
  };

  const desfazerExclusao = (colunaId: string) =>
    setExcluindo((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== colunaId)),
    );

  const novaColuna = () =>
    setLinhas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        titulo: "",
        hex: "#64748b",
        tipo: "padrao",
        tetoTexto: "7",
        motivosTexto: "",
      },
    ]);

  const salvar = async () => {
    if (salvando) return;
    const ficam = linhas.filter((l) => !(l.id in excluindo));
    const nomeDe = (colunaId: string) =>
      linhas.find((l) => l.id === colunaId)?.titulo.trim() || "sem nome";

    for (const [colunaId, destinoId] of Object.entries(excluindo)) {
      if (!destinoId || !ficam.some((l) => l.id === destinoId)) {
        toast.error(`Escolha para qual coluna vão os leads de "${nomeDe(colunaId)}".`);
        return;
      }
    }

    const lista: ColunaCrm[] = [];
    for (const [ordem, l] of ficam.entries()) {
      const config: ColunaCrm["config"] = {};
      if (TIPOS_FOLLOW_UP.includes(l.tipo)) {
        const teto = Number(l.tetoTexto);
        if (!Number.isInteger(teto) || teto < 1 || teto > 30) {
          toast.error(
            `O limite de tentativas de "${l.titulo.trim() || "sem nome"}" precisa ser de 1 a 30.`,
          );
          return;
        }
        config.teto = teto;
      }
      if (TIPOS_MOTIVO.includes(l.tipo)) {
        const motivos = l.motivosTexto
          .split("\n")
          .map((m) => m.trim())
          .filter(Boolean);
        if (motivos.length) config.motivos = motivos;
      }
      lista.push({ id: l.id, titulo: l.titulo.trim(), hex: l.hex, ordem, tipo: l.tipo, config });
    }

    const erro = validarColunas(lista);
    if (erro) {
      toast.error(erro);
      return;
    }

    const remocoes = [
      ...Object.entries(excluindo).map(([colunaId, destinoId]) => ({ id: colunaId, destinoId })),
      // sem leads: o destino não é usado, só a exclusão
      ...semLeads.map((colunaId) => ({ id: colunaId, destinoId: lista[0].id })),
    ];

    setSalvando(true);
    try {
      if (await salvarColunas(lista, remocoes)) onFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o && !salvando) onFechar();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Colunas</DialogTitle>
          <DialogDescription>
            Nome, cor, ordem e tipo de cada coluna. O tipo define o que o CRM pede ao mover um lead
            para ela.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          <ul className="grid gap-2">
            {linhas.map((l, i) => {
              const marcada = l.id in excluindo;
              const n = leadsNa(l.id);
              const destinos = linhas.filter((d) => d.id !== l.id && !(d.id in excluindo));
              return (
                <li
                  key={l.id}
                  className={`grid gap-2 rounded-lg border p-3 ${marcada ? "border-destructive/50 bg-destructive/5" : "border-border/60"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-6"
                        aria-label="Subir coluna"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                      >
                        <ArrowUp size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-6"
                        aria-label="Descer coluna"
                        disabled={i === linhas.length - 1}
                        onClick={() => mover(i, 1)}
                      >
                        <ArrowDown size={13} />
                      </Button>
                    </div>
                    <input
                      type="color"
                      aria-label={`Cor da coluna ${l.titulo}`}
                      value={l.hex}
                      onChange={(e) => mudar(l.id, { hex: e.target.value })}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                    />
                    <Input
                      aria-label="Nome da coluna"
                      placeholder="Nome da coluna"
                      value={l.titulo}
                      onChange={(e) => mudar(l.id, { titulo: e.target.value })}
                      className="min-w-0 flex-1 basis-40"
                    />
                    <Select
                      value={l.tipo}
                      onValueChange={(v) => mudar(l.id, { tipo: v as TipoColuna })}
                    >
                      <SelectTrigger aria-label="Tipo da coluna" className="w-full sm:w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_COLUNA.map((t) => (
                          <SelectItem key={t.tipo} value={t.tipo}>
                            {t.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {marcada ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Desfazer exclusão"
                        title="Desfazer exclusão"
                        onClick={() => desfazerExclusao(l.id)}
                      >
                        <Undo2 size={15} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Excluir coluna"
                        title="Excluir coluna"
                        onClick={() => excluir(l.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">{descricaoTipo(l.tipo)}</p>

                  {!marcada && TIPOS_FOLLOW_UP.includes(l.tipo) && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`${id}-${l.id}-teto`} className="text-xs font-normal">
                        Limite de tentativas
                      </Label>
                      <Input
                        id={`${id}-${l.id}-teto`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={30}
                        value={l.tetoTexto}
                        onChange={(e) => mudar(l.id, { tetoTexto: e.target.value })}
                        className="h-8 w-20"
                      />
                    </div>
                  )}

                  {!marcada && TIPOS_MOTIVO.includes(l.tipo) && (
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${id}-${l.id}-motivos`} className="text-xs font-normal">
                        Motivos (um por linha)
                      </Label>
                      <Textarea
                        id={`${id}-${l.id}-motivos`}
                        rows={4}
                        placeholder="Vazio = motivos padrão"
                        value={l.motivosTexto}
                        onChange={(e) => mudar(l.id, { motivosTexto: e.target.value })}
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Um motivo "Outro" abre um campo de texto ao mover.
                      </p>
                    </div>
                  )}

                  {marcada && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-destructive">
                        Esta coluna será excluída. Mover os {n} {n === 1 ? "lead" : "leads"} para…
                      </Label>
                      <Select
                        value={excluindo[l.id] ?? ""}
                        onValueChange={(v) => setExcluindo((prev) => ({ ...prev, [l.id]: v }))}
                      >
                        <SelectTrigger className="w-full sm:w-72">
                          <SelectValue placeholder="Escolha a coluna de destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {destinos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.titulo.trim() || "Nova coluna (sem nome)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Os leads vão para lá sem as exigências da coluna de destino, com registro no
                        histórico.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={novaColuna}
          >
            <Plus size={14} /> Nova coluna
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Mudar o tipo de uma coluna muda as regras só dos próximos movimentos.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
