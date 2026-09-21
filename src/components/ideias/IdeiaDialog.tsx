import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAgencias } from "@/lib/agencias";
import { salvarIdeia, mensagemErro, type Ideia } from "@/lib/ideias";
import { TIPOS_IDEIA, limparLinks, type TipoIdeia } from "@/lib/ideiasTexto";
import { toast } from "sonner";

interface Props {
  state: { ideia?: Ideia } | null;
  clientes: { id: string; nome: string; agencia: string }[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function IdeiaDialog({ state, clientes, onClose, onSaved }: Props) {
  const { agencias } = useAgencias();
  const [tipo, setTipo] = useState<TipoIdeia>("este_sistema");
  const [agencia, setAgencia] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    const i = state.ideia;
    setTipo(i?.tipo || "este_sistema");
    setAgencia(i?.agencia || "");
    setClienteId(i?.cliente_id || "");
    setTitulo(i?.titulo || "");
    setDescricao(i?.descricao || "");
    setLinks(i?.links?.length ? [...i.links] : []);
  }, [state]);

  const clientesDaAgencia = clientes.filter((c) => c.agencia === agencia);

  const setLink = (idx: number, v: string) => setLinks((prev) => prev.map((l, i) => (i === idx ? v : l)));
  const removerLink = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!titulo.trim()) { toast.error("Dê um nome para a ideia"); return; }
    if (tipo === "cliente" && !agencia) { toast.error("Escolha a agência"); return; }
    if (tipo === "cliente" && !clienteId) { toast.error("Escolha o cliente"); return; }
    setSaving(true);
    try {
      await salvarIdeia(
        {
          tipo,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          links: limparLinks(links),
          agencia: tipo === "cliente" ? agencia : null,
          cliente_id: tipo === "cliente" ? clienteId : null,
        },
        state?.ideia?.id,
      );
      toast.success(state?.ideia ? "Ideia atualizada" : "Ideia guardada");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(mensagemErro(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state?.ideia ? "Editar ideia" : "Nova ideia"}</DialogTitle>
          <DialogDescription>Onde a ideia se aplica, um nome curto e, se quiser, descrição e links de referência.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-2">
            <Label htmlFor="ideia-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoIdeia); if (v !== "cliente") { setAgencia(""); setClienteId(""); } }}>
              <SelectTrigger id="ideia-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_IDEIA.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.hex }} />
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tipo === "cliente" && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="space-y-2">
                <Label htmlFor="ideia-agencia">Agência</Label>
                <Select value={agencia || undefined} onValueChange={(v) => { setAgencia(v); setClienteId(""); }}>
                  <SelectTrigger id="ideia-agencia"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    {agencias.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.hex }} />
                          {a.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ideia-cliente">Cliente</Label>
                <Select value={clienteId || undefined} onValueChange={setClienteId} disabled={!agencia}>
                  <SelectTrigger id="ideia-cliente"><SelectValue placeholder={agencia ? "Escolher" : "Escolha a agência"} /></SelectTrigger>
                  <SelectContent>
                    {clientesDaAgencia.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    {agencia && clientesDaAgencia.length === 0 && (
                      <SelectItem value="__nenhum" disabled>Nenhum cliente nessa agência</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ideia-titulo">Nome</Label>
            <Input id="ideia-titulo" autoFocus placeholder="Ex.: Alerta de saldo por WhatsApp" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ideia-descricao">Descrição (opcional)</Label>
            <Textarea id="ideia-descricao" rows={4} placeholder="O que é, por que vale a pena, como imagino funcionar..." value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Links de referência (opcional)</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLinks((prev) => [...prev, ""])}>
                <Plus size={14} /> Adicionar link
              </Button>
            </div>
            {links.length === 0 && <p className="text-xs text-muted-foreground">Nenhum link. Use "Adicionar link" para colar referências.</p>}
            <div className="space-y-2">
              {links.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input placeholder="https://..." value={l} onChange={(e) => setLink(idx, e.target.value)} />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => removerLink(idx)} title="Remover link">
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : state?.ideia ? "Salvar" : "Guardar ideia"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
