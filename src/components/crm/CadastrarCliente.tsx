// Lead ganho → cadastro no Faturamento (mesma janela da aba Financeiro) → cadastro em Clientes ativos → vínculo no
// lead (spec §4.7). Sem props: segue `cadastroCliente` do contexto. Cancelar qualquer uma das janelas encerra a
// sequência; o que já foi salvo continua salvo.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientForm, type ClientFormValues } from "@/components/ClientForm";
import { FonteDialog } from "@/components/financeiro/FonteDialog";
import { saveCliente } from "@/lib/clientesService";
import { camposDeIso } from "@/lib/crmFormato";
import type { LeadCrm } from "@/lib/crmTipos";
import { useCrm } from "./CrmContexto";

type Etapa = "faturamento" | "cliente" | null;

export function CadastrarCliente() {
  const { cadastroCliente, iniciarCadastroCliente, concluirCadastroCliente, leads } = useCrm();
  const [etapa, setEtapa] = useState<Etapa>(null);
  // Lead da sequência; continua guardado depois de encerrar para as janelas fecharem com a animação normal
  const [alvo, setAlvo] = useState<LeadCrm | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Espelho síncrono da etapa: ao salvar, o FonteDialog chama onSalvo e logo em seguida onFechar, no mesmo clique
  const etapaRef = useRef<Etapa>(null);

  const irPara = (e: Etapa) => {
    etapaRef.current = e;
    setEtapa(e);
  };

  useEffect(() => {
    const e: Etapa = cadastroCliente ? "faturamento" : null;
    etapaRef.current = e;
    setEtapa(e);
    if (cadastroCliente) setAlvo(cadastroCliente);
  }, [cadastroCliente]);

  const encerrar = () => {
    irPara(null);
    iniciarCadastroCliente(null);
  };

  if (!alvo) return null;
  // Versão mais recente do lead (pode ter sido editado depois do "Cadastrar como cliente")
  const lead = leads.find((l) => l.id === alvo.id) ?? alvo;
  const nome = lead.empresa || lead.nome;

  const salvarCliente = async (values: ClientFormValues) => {
    setSalvando(true);
    try {
      const id = await saveCliente(values, null);
      if (await concluirCadastroCliente(lead, id)) toast.success("Cliente cadastrado e vinculado ao lead");
      else toast.warning("Cliente cadastrado, mas não foi possível vinculá-lo ao lead.");
      encerrar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cadastrar cliente");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <FonteDialog
        key={lead.id}
        aberto={etapa === "faturamento"}
        fonte={null}
        inicial={{ nome, valorMensal: lead.valor_fechamento ?? undefined, observacoes: "Cliente vindo do CRM" }}
        onFechar={() => {
          // Depois de salvar a etapa já é "cliente": fechar esta janela não é cancelamento
          if (etapaRef.current === "faturamento") encerrar();
        }}
        onSalvo={() => irPara("cliente")}
      />
      <Dialog open={etapa === "cliente"} onOpenChange={(o) => { if (!o) encerrar(); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar em Clientes ativos</DialogTitle>
            <DialogDescription>
              Confira os dados que vieram do lead. Ao salvar, o cliente fica vinculado a {nome}.
            </DialogDescription>
          </DialogHeader>
          <ClientForm
            key={lead.id}
            initialValues={{
              nome,
              nicho: lead.nicho ?? undefined,
              agencia: lead.agencia_destino ?? undefined,
              data_inicio: camposDeIso(new Date().toISOString()).data,
            }}
            onSubmit={salvarCliente}
            loading={salvando}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
