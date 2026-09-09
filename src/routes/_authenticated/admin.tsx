import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Check, Sun, Moon,
  Columns3, Database, Download, AlertTriangle, EyeOff, Eye, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAgencias, AGENCIA_COLORS, slugifyAgenciaId, type AgenciaDef } from "@/lib/agencias";
import { useDemandaColunas, COLUMN_COLORS, slugifyColumnId, type KanbanColumnDef } from "@/lib/demandaColunas";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type AgenciaDialog =
  | { mode: "create"; nome: string; hex: string }
  | { mode: "edit"; id: string; nome: string; hex: string };

type ColunaDialog =
  | { mode: "create"; titulo: string; hex: string }
  | { mode: "edit"; id: string; titulo: string; hex: string };

type WipeTarget = "clientes" | "demandas" | "colunas";

const WIPE_META: Record<WipeTarget, { titulo: string; botao: string }> = {
  clientes: { titulo: "Apagar todos os clientes?", botao: "Apagar todos os clientes" },
  demandas: { titulo: "Apagar todas as demandas?", botao: "Apagar todas as demandas" },
  colunas: { titulo: "Apagar todas as colunas do Kanban?", botao: "Apagar colunas e demandas" },
};

function AdminPage() {
  const { todasAgencias, reload: reloadAgencias } = useAgencias();
  const { colunas, reload: reloadColunas } = useDemandaColunas();
  const { theme, setTheme } = useTheme();

  const [clientesPorAgencia, setClientesPorAgencia] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  const [agenciaDialog, setAgenciaDialog] = useState<AgenciaDialog | null>(null);
  const [agenciaToDelete, setAgenciaToDelete] = useState<AgenciaDef | null>(null);

  const [colunaDialog, setColunaDialog] = useState<ColunaDialog | null>(null);
  const [colunaToDelete, setColunaToDelete] = useState<KanbanColumnDef | null>(null);

  const [wipeTarget, setWipeTarget] = useState<WipeTarget | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState("");

  const loadCounts = async () => {
    const tables = ["clientes", "demandas", "nps_avaliacoes", "saldo_ads", "recargas", "prospeccao", "acessos_clientes"] as const;
    const results = await Promise.all(
      tables.map(async (t) => {
        const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
        return [t, error ? null : count ?? 0] as const;
      })
    );
    setCounts(Object.fromEntries(results));

    const { data } = await supabase.from("clientes").select("agencia");
    const porAgencia: Record<string, number> = {};
    (data || []).forEach((c) => { porAgencia[c.agencia] = (porAgencia[c.agencia] || 0) + 1; });
    setClientesPorAgencia(porAgencia);
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const totalDemandasPorColuna = useMemo(() => {
    // Só para exibir; contagem exata vem da aba Demandas
    return counts.demandas ?? null;
  }, [counts]);

  // ---------- Agências ----------
  const handleSaveAgencia = async () => {
    if (!agenciaDialog) return;
    const nome = agenciaDialog.nome.trim();
    if (!nome) {
      toast.error("Informe o nome da agência");
      return;
    }
    setSaving(true);
    try {
      if (agenciaDialog.mode === "edit") {
        const { error } = await supabase
          .from("agencias")
          .update({ nome, hex: agenciaDialog.hex })
          .eq("id", agenciaDialog.id);
        if (error) throw error;
        toast.success("Agência atualizada");
      } else {
        let id = slugifyAgenciaId(nome);
        if (todasAgencias.some((a) => a.id === id)) id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
        const ordem = todasAgencias.length ? Math.max(...todasAgencias.map((a) => a.ordem)) + 1 : 0;
        const { error } = await supabase
          .from("agencias")
          .insert([{ id, nome, hex: agenciaDialog.hex, ordem }]);
        if (error) throw error;
        toast.success("Agência criada");
      }
      setAgenciaDialog(null);
      await reloadAgencias();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar agência");
    } finally {
      setSaving(false);
    }
  };

  const moveAgencia = async (agencia: AgenciaDef, direction: -1 | 1) => {
    const sorted = [...todasAgencias].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((a) => a.id === agencia.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    // Reescreve a ordem inteira para não depender de valores repetidos
    const reordered = [...sorted];
    reordered[idx] = swapWith;
    reordered[idx + direction] = agencia;
    await Promise.all(reordered.map((a, i) => supabase.from("agencias").update({ ordem: i }).eq("id", a.id)));
    await reloadAgencias();
  };

  const toggleAtiva = async (agencia: AgenciaDef) => {
    const { error } = await supabase.from("agencias").update({ ativa: !agencia.ativa }).eq("id", agencia.id);
    if (error) toast.error(error.message);
    else {
      toast.success(agencia.ativa ? "Agência ocultada dos filtros" : "Agência reativada");
      await reloadAgencias();
    }
  };

  const handleDeleteAgencia = async () => {
    if (!agenciaToDelete) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("agencias").delete().eq("id", agenciaToDelete.id);
      if (error) throw error;
      toast.success(`Agência "${agenciaToDelete.label}" excluída`);
      setAgenciaToDelete(null);
      await reloadAgencias();
    } catch (e: any) {
      toast.error(e.message?.includes("violates foreign key")
        ? "Há clientes nesta agência. Mova-os antes de excluir."
        : e.message || "Erro ao excluir agência");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Colunas do Kanban ----------
  const handleSaveColuna = async () => {
    if (!colunaDialog) return;
    const titulo = colunaDialog.titulo.trim();
    if (!titulo) {
      toast.error("Informe o nome da coluna");
      return;
    }
    setSaving(true);
    try {
      if (colunaDialog.mode === "edit") {
        const { error } = await supabase
          .from("demanda_colunas")
          .update({ titulo, hex: colunaDialog.hex })
          .eq("id", colunaDialog.id);
        if (error) throw error;
        toast.success("Coluna atualizada");
      } else {
        // Mesma regra da aba Demandas: nova coluna entra antes de "Feito", se existir
        const feitoIdx = colunas.findIndex((c) => c.id === "feito");
        const ordem = feitoIdx >= 0 ? feitoIdx : colunas.length;
        const { error } = await supabase
          .from("demanda_colunas")
          .insert([{ id: slugifyColumnId(titulo), titulo, hex: colunaDialog.hex, ordem }]);
        if (error) throw error;
        // Empurra as colunas seguintes para manter a ordem consistente
        await Promise.all(
          colunas.slice(ordem).map((c, i) =>
            supabase.from("demanda_colunas").update({ ordem: ordem + 1 + i }).eq("id", c.id)
          )
        );
        toast.success("Coluna criada");
      }
      setColunaDialog(null);
      await reloadColunas();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar coluna");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteColuna = async () => {
    if (!colunaToDelete) return;
    setSaving(true);
    try {
      const { error: delDemandas } = await supabase.from("demandas").delete().eq("status", colunaToDelete.id);
      if (delDemandas) throw delDemandas;
      const { error } = await supabase.from("demanda_colunas").delete().eq("id", colunaToDelete.id);
      if (error) throw error;
      toast.success(`Coluna "${colunaToDelete.title}" excluída`);
      setColunaToDelete(null);
      await Promise.all([reloadColunas(), loadCounts()]);
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir coluna");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Dados ----------
  const exportClientesCsv = async () => {
    const { data, error } = await supabase.from("clientes_view").select("*").order("nome");
    if (error || !data) {
      toast.error("Erro ao exportar clientes");
      return;
    }
    const cols = ["nome", "agencia", "nicho", "status_operacional", "data_inicio", "verba_ads", "tipo_verba", "verba_total_contratada", "data_limite_verba", "nps_status", "demandas_ativas", "observacoes"];
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(";"), ...(data as any[]).map((row) => cols.map((c) => escape(row[c])).join(";"))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Zona de perigo ----------
  const wipeAllDemandas = async () => {
    // Execuções de recorrentes caem em cascata junto com as demandas
    const { error } = await supabase.from("demandas").delete().not("id", "is", null);
    if (error) throw error;
  };

  const handleWipe = async () => {
    if (!wipeTarget) return;
    setSaving(true);
    try {
      if (wipeTarget === "clientes") {
        // Demandas ficam (só perdem o vínculo com o cliente); NPS, saldo, recargas e
        // pendências caem em cascata. Agências, colunas e acessos não são afetados.
        const { error: unlinkError } = await supabase
          .from("demandas")
          .update({ cliente_id: null })
          .not("cliente_id", "is", null);
        if (unlinkError) throw unlinkError;
        const { error } = await supabase.from("clientes").delete().not("id", "is", null);
        if (error) throw error;
        toast.success("Todos os clientes foram apagados");
      } else if (wipeTarget === "demandas") {
        await wipeAllDemandas();
        toast.success("Todas as demandas foram apagadas");
      } else {
        // Colunas só podem sair depois das demandas (FK demandas.status -> demanda_colunas)
        await wipeAllDemandas();
        const { error } = await supabase.from("demanda_colunas").delete().not("id", "is", null);
        if (error) throw error;
        toast.success("Colunas e demandas do Kanban foram apagadas");
        await reloadColunas();
      }
      setWipeTarget(null);
      setWipeConfirm("");
      await loadCounts();
    } catch (e: any) {
      toast.error(e.message || "Erro ao apagar");
    } finally {
      setSaving(false);
    }
  };

  const wipeDescription = (target: WipeTarget) => {
    if (target === "clientes") {
      return (
        <>Isso remove <strong>{counts.clientes ?? "todos os"}</strong> clientes e o que depende deles (NPS, saldos, recargas, pendências). As demandas do Kanban ficam, sem cliente vinculado. Não há como desfazer.</>
      );
    }
    if (target === "demandas") {
      return (
        <>Isso remove <strong>{counts.demandas ?? "todas as"}</strong> demandas de todas as colunas, incluindo recorrentes e o histórico de execuções. As colunas continuam. Não há como desfazer.</>
      );
    }
    return (
      <>Isso remove <strong>todas as {colunas.length} colunas</strong> do Kanban e as <strong>{counts.demandas ?? ""}</strong> demandas dentro delas. A aba Demandas fica vazia até você criar colunas novas. Não há como desfazer.</>
    );
  };

  const agenciasOrdenadas = [...todasAgencias].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Configurações gerais: agências, colunas do Kanban, aparência e dados.</p>
      </div>

      {/* Agências */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 size={18} /> Agências</CardTitle>
            <CardDescription>Aparecem nos filtros de Clientes, Saldo, NPS, Prospecção e Planilha/CRM. Renomear reflete em todas as abas.</CardDescription>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setAgenciaDialog({ mode: "create", nome: "", hex: AGENCIA_COLORS[todasAgencias.length % AGENCIA_COLORS.length] })}>
            <Plus size={14} /> Nova agência
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {agenciasOrdenadas.map((a, idx) => {
              const qtd = clientesPorAgencia[a.id] || 0;
              return (
                <div key={a.id} className={cn("flex items-center gap-3 px-3 py-2", !a.ativa && "opacity-50")}>
                  <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: a.hex }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{a.label}</span>
                      {!a.ativa && <Badge variant="outline" className="text-[10px]">Oculta</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{a.id}</span> · {qtd} {qtd === 1 ? "cliente" : "clientes"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveAgencia(a, -1)} title="Subir">
                      <ArrowUp size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === agenciasOrdenadas.length - 1} onClick={() => moveAgencia(a, 1)} title="Descer">
                      <ArrowDown size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleAtiva(a)} title={a.ativa ? "Ocultar dos filtros" : "Reativar"}>
                      {a.ativa ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAgenciaDialog({ mode: "edit", id: a.id, nome: a.label, hex: a.hex })} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={qtd > 0}
                      onClick={() => setAgenciaToDelete(a)}
                      title={qtd > 0 ? "Mova os clientes antes de excluir" : "Excluir"}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
            {agenciasOrdenadas.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhuma agência cadastrada.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Colunas do Kanban */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Columns3 size={18} /> Colunas do Kanban (Demandas)</CardTitle>
            <CardDescription>Crie, renomeie e escolha a cor das colunas. Para mover demandas entre colunas, use a aba Demandas.</CardDescription>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setColunaDialog({ mode: "create", titulo: "", hex: COLUMN_COLORS[colunas.length % COLUMN_COLORS.length] })}>
            <Plus size={14} /> Nova coluna
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {colunas.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.title}</span>
                    {c.sistema && <Badge variant="outline" className="text-[10px]">Fixa</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{c.id}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setColunaDialog({ mode: "edit", id: c.id, titulo: c.title, hex: c.hex })} title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={c.sistema}
                  onClick={() => setColunaToDelete(c)}
                  title={c.sistema ? "Coluna fixa do sistema" : "Excluir coluna e suas demandas"}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {colunas.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhuma coluna. Clique em "Nova coluna" para criar a primeira.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Aparência */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sun size={18} /> Aparência</CardTitle>
          <CardDescription>O botão no topo da tela também alterna o tema.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant={theme === "light" ? "default" : "outline"} className="gap-2" onClick={() => setTheme("light")}>
            <Sun size={14} /> Claro
          </Button>
          <Button variant={theme === "dark" ? "default" : "outline"} className="gap-2" onClick={() => setTheme("dark")}>
            <Moon size={14} /> Escuro
          </Button>
        </CardContent>
      </Card>

      {/* Dados */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Database size={18} /> Dados</CardTitle>
            <CardDescription>Volume atual por tabela e exportação.</CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-2" onClick={loadCounts}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportClientesCsv}>
              <Download size={14} /> Exportar clientes (CSV)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["clientes", "Clientes"],
              ["demandas", "Demandas"],
              ["nps_avaliacoes", "Avaliações NPS"],
              ["saldo_ads", "Registros de saldo"],
              ["recargas", "Recargas"],
              ["prospeccao", "Leads"],
              ["acessos_clientes", "Acessos (Planilha/CRM)"],
            ].map(([key, label]) => (
              <div key={key} className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="numeric text-xl font-semibold">{counts[key] === undefined ? "…" : counts[key] === null ? "—" : counts[key]}</p>
              </div>
            ))}
          </div>
          {totalDemandasPorColuna === null && (
            <p className="text-xs text-muted-foreground mt-3">Algumas tabelas ainda não existem no banco — aplique as migrations pendentes.</p>
          )}
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle size={18} /> Zona de perigo</CardTitle>
          <CardDescription>Ações irreversíveis, sempre com confirmação digitada. Agências e acessos (Planilha/CRM) nunca são afetados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 p-3">
            <div>
              <p className="font-medium">Apagar todos os clientes</p>
              <p className="text-xs text-muted-foreground">Remove os {counts.clientes ?? "…"} clientes e, com eles, avaliações NPS, saldos/recargas e pendências. Demandas e leads ficam, apenas desvinculados do cliente.</p>
            </div>
            <Button variant="destructive" size="sm" className="shrink-0" onClick={() => { setWipeConfirm(""); setWipeTarget("clientes"); }}>
              Apagar clientes
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 p-3">
            <div>
              <p className="font-medium">Apagar todas as demandas</p>
              <p className="text-xs text-muted-foreground">Esvazia todas as colunas do Kanban ({counts.demandas ?? "…"} demandas, incluindo recorrentes). As colunas continuam.</p>
            </div>
            <Button variant="destructive" size="sm" className="shrink-0" onClick={() => { setWipeConfirm(""); setWipeTarget("demandas"); }}>
              Apagar demandas
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 p-3">
            <div>
              <p className="font-medium">Apagar todas as colunas do Kanban</p>
              <p className="text-xs text-muted-foreground">Remove as {colunas.length} colunas da aba Demandas e as demandas dentro delas. Depois, crie colunas novas pelo botão "Nova coluna".</p>
            </div>
            <Button variant="destructive" size="sm" className="shrink-0" onClick={() => { setWipeConfirm(""); setWipeTarget("colunas"); }}>
              Apagar colunas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog agência */}
      <Dialog open={!!agenciaDialog} onOpenChange={(o) => { if (!o) setAgenciaDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{agenciaDialog?.mode === "edit" ? "Editar agência" : "Nova agência"}</DialogTitle>
          </DialogHeader>
          {agenciaDialog && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSaveAgencia(); }}>
              <div className="space-y-2">
                <Label htmlFor="agencia-nome">Nome</Label>
                <Input
                  id="agencia-nome"
                  autoFocus
                  placeholder="Ex.: AZO"
                  value={agenciaDialog.nome}
                  onChange={(e) => setAgenciaDialog({ ...agenciaDialog, nome: e.target.value })}
                />
                {agenciaDialog.mode === "create" && agenciaDialog.nome.trim() && (
                  <p className="text-xs text-muted-foreground">Identificador: <span className="font-mono">{slugifyAgenciaId(agenciaDialog.nome)}</span></p>
                )}
              </div>
              <ColorPicker colors={AGENCIA_COLORS} value={agenciaDialog.hex} onChange={(hex) => setAgenciaDialog({ ...agenciaDialog, hex })} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAgenciaDialog(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : agenciaDialog.mode === "edit" ? "Salvar" : "Criar agência"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!agenciaToDelete} onOpenChange={(o) => { if (!o) setAgenciaToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agência "{agenciaToDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>Ela some de todos os filtros. Leads de prospecção apontando para ela ficam sem agência de destino.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteAgencia(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog coluna */}
      <Dialog open={!!colunaDialog} onOpenChange={(o) => { if (!o) setColunaDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{colunaDialog?.mode === "edit" ? "Editar coluna" : "Nova coluna"}</DialogTitle>
          </DialogHeader>
          {colunaDialog && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSaveColuna(); }}>
              <div className="space-y-2">
                <Label htmlFor="coluna-titulo">Nome</Label>
                <Input
                  id="coluna-titulo"
                  autoFocus
                  value={colunaDialog.titulo}
                  onChange={(e) => setColunaDialog({ ...colunaDialog, titulo: e.target.value })}
                />
              </div>
              <ColorPicker colors={COLUMN_COLORS} value={colunaDialog.hex} onChange={(hex) => setColunaDialog({ ...colunaDialog, hex })} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setColunaDialog(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : colunaDialog.mode === "edit" ? "Salvar" : "Criar coluna"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!colunaToDelete} onOpenChange={(o) => { if (!o) setColunaToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna "{colunaToDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>Todas as demandas dessa coluna serão removidas permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteColuna(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir coluna"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação das ações da zona de perigo */}
      <AlertDialog open={!!wipeTarget} onOpenChange={(o) => { if (!o) { setWipeTarget(null); setWipeConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{wipeTarget ? WIPE_META[wipeTarget].titulo : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{wipeTarget && wipeDescription(wipeTarget)}</p>
                <p>Digite <span className="font-mono font-bold">APAGAR</span> para confirmar:</p>
                <Input value={wipeConfirm} onChange={(e) => setWipeConfirm(e.target.value)} placeholder="APAGAR" autoComplete="off" />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleWipe(); }}
              disabled={saving || wipeConfirm.trim().toUpperCase() !== "APAGAR"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {saving ? "Apagando..." : wipeTarget ? WIPE_META[wipeTarget].botao : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ColorPicker({ colors, value, onChange }: { colors: string[]; value: string; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Cor</Label>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
              value === hex && "ring-2 ring-offset-2 ring-offset-background ring-zinc-900 dark:ring-zinc-100"
            )}
            style={{ backgroundColor: hex }}
            title={hex}
          >
            {value === hex && <Check size={14} className="text-white" />}
          </button>
        ))}
      </div>
    </div>
  );
}
