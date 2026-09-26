// Janela "Novo lead": só o essencial; o resto se completa na ficha, que abre logo depois de salvar.
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/components/crm/CrmContexto";
import { emailValido } from "@/lib/crmColunas";
import type { Trafego } from "@/lib/crmTipos";

interface Rascunho {
  nome: string;
  empresa: string;
  telefone: string;
  email: string;
  trafego: Trafego;
  observacoes: string;
}

const VAZIO: Rascunho = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  trafego: "organico",
  observacoes: "",
};

export function NovoLeadDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { criarLead, abrirFicha } = useCrm();
  const id = useId();
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const mudar = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setR((prev) => ({ ...prev, [campo]: valor }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    const nome = r.nome.trim();
    if (!nome) {
      toast.error("Informe o nome do lead.");
      return;
    }
    const email = r.email.trim();
    if (email && !emailValido(email)) {
      toast.error("E-mail inválido.");
      return;
    }
    setSalvando(true);
    try {
      const lead = await criarLead({
        nome,
        empresa: r.empresa.trim() || null,
        telefone: r.telefone.trim() || null,
        email: email || null,
        trafego: r.trafego,
        observacoes: r.observacoes.trim() || null,
      });
      if (lead) {
        setR(VAZIO);
        onFechar();
        abrirFicha(lead.id);
      }
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
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={salvar} noValidate>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription>
              O lead entra na primeira coluna. Os outros dados você completa na ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-nome`}>Nome</Label>
              <Input
                id={`${id}-nome`}
                autoComplete="off"
                placeholder="Nome do lead"
                value={r.nome}
                onChange={(e) => mudar("nome", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-empresa`}>Empresa</Label>
              <Input
                id={`${id}-empresa`}
                autoComplete="off"
                value={r.empresa}
                onChange={(e) => mudar("empresa", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-telefone`}>Telefone/WhatsApp</Label>
                <Input
                  id={`${id}-telefone`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(11) 91234-5678"
                  value={r.telefone}
                  onChange={(e) => mudar("telefone", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-email`}>E-mail</Label>
                <Input
                  id={`${id}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={r.email}
                  onChange={(e) => mudar("email", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Etiqueta</Label>
              <RadioGroup
                value={r.trafego}
                onValueChange={(v) => mudar("trafego", v as Trafego)}
                className="flex flex-wrap gap-x-5 gap-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="organico" id={`${id}-organico`} />
                  <Label htmlFor={`${id}-organico`} className="cursor-pointer font-normal">
                    Orgânico
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pago" id={`${id}-pago`} />
                  <Label htmlFor={`${id}-pago`} className="cursor-pointer font-normal">
                    Pago
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-descricao`}>Descrição</Label>
              <Textarea
                id={`${id}-descricao`}
                placeholder="O que você sabe do lead, como chegou, o que precisa…"
                value={r.observacoes}
                onChange={(e) => mudar("observacoes", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !r.nome.trim()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
