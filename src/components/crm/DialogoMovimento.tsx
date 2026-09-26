// Janela que pede o que a coluna de destino exige (reunião, remarcação, proposta, ganho ou motivo) antes de mover.
// Cancelar (botão, X, Esc ou clique fora) chama resolverMovimento(null) uma única vez: o card volta e nada é gravado.
import { useId, useRef, useState, type FormEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCrm, type MovimentoPendente } from "@/components/crm/CrmContexto";
import {
  CamposReuniao,
  duracaoPadraoReuniao,
  type CamposReuniaoValor,
} from "@/components/crm/CamposReuniao";
import { MOTIVOS_REMARCACAO, motivosDa } from "@/lib/crmColunas";
import type { DadosJanela, DadosReuniao } from "@/lib/crmMovimento";
import type { MotivoRemarcacao } from "@/lib/crmTipos";
import { camposDeIso, formatarDataHora, isoDeCampos } from "@/lib/crmFormato";
import { maskBRLInput, parseBRLInput } from "@/lib/clientes";

const paraReuniao = (v: CamposReuniaoValor): DadosReuniao => ({
  em: isoDeCampos(v.data, v.hora) ?? "",
  duracaoMin: v.duracaoMin,
});

/** 1500 → "1.500,00" (formato da máscara) */
const textoReais = (v: number | null | undefined) => (v && v > 0 ? maskBRLInput(v.toFixed(2)) : "");

const ehOutro = (m: string) => m.trim().toLowerCase() === "outro";

export function DialogoMovimento() {
  const { movimentoPendente: p, resolverMovimento } = useCrm();
  const [salvandoDe, setSalvandoDe] = useState<MovimentoPendente | null>(null);
  const salvando = !!p && salvandoDe === p;
  /** Pendência já cancelada/confirmada (garante um único resolverMovimento(null)) */
  const tratado = useRef<MovimentoPendente | null>(null);
  /** Última pendência exibida: mantém o conteúdo durante a animação de saída e reinicia o formulário a cada nova */
  const ultimo = useRef<{ p: MovimentoPendente; n: number } | null>(null);
  if (p && ultimo.current?.p !== p) ultimo.current = { p, n: (ultimo.current?.n ?? 0) + 1 };
  const exibido = ultimo.current;

  const cancelar = () => {
    if (!p || salvando || tratado.current === p) return;
    tratado.current = p;
    void resolverMovimento(null);
  };

  const confirmar = async (dados: DadosJanela) => {
    if (!p || salvando || tratado.current === p) return;
    const alvo = p;
    setSalvandoDe(alvo);
    try {
      const ok = await resolverMovimento(dados);
      if (ok) tratado.current = alvo;
    } finally {
      setSalvandoDe((s) => (s === alvo ? null : s));
    }
  };

  return (
    <Dialog
      open={!!p}
      onOpenChange={(aberto) => {
        if (!aberto) cancelar();
      }}
    >
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        {exibido && (
          <FormularioMovimento
            key={exibido.n}
            p={exibido.p}
            salvando={salvando}
            onCancelar={cancelar}
            onConfirmar={confirmar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioMovimento({
  p,
  salvando,
  onCancelar,
  onConfirmar,
}: {
  p: MovimentoPendente;
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (dados: DadosJanela) => void;
}) {
  const id = useId();
  const { lead, destino, exigencia } = p;

  // reunião (e confirmação sem data): vem com a reunião atual, se houver
  const [reuniao, setReuniao] = useState<CamposReuniaoValor>(() => ({
    ...camposDeIso(lead.reuniao_em),
    duracaoMin:
      lead.reuniao_em && lead.reuniao_duracao_min
        ? lead.reuniao_duracao_min
        : duracaoPadraoReuniao(),
  }));

  // remarcação: a nova data começa vazia de propósito
  const [motivoRemarcacao, setMotivoRemarcacao] = useState<MotivoRemarcacao | null>(null);
  const [temNova, setTemNova] = useState(false);
  const [nova, setNova] = useState<CamposReuniaoValor>(() => ({
    data: "",
    hora: "",
    duracaoMin: lead.reuniao_duracao_min ?? duracaoPadraoReuniao(),
  }));

  // proposta e ganho
  const [valorTexto, setValorTexto] = useState(() =>
    exigencia === "ganho"
      ? textoReais(lead.valor_fechamento ?? lead.valor_proposta)
      : textoReais(lead.valor_proposta),
  );

  // perdido e desqualificado
  const motivos = motivosDa(destino);
  const [motivo, setMotivo] = useState("");
  const [outroTexto, setOutroTexto] = useState("");

  const reuniaoFutura = !!lead.reuniao_em && new Date(lead.reuniao_em).getTime() > Date.now();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    switch (exigencia) {
      case "reuniao":
        onConfirmar({ reuniao: paraReuniao(reuniao) });
        return;
      case "remarcacao": {
        if (!motivoRemarcacao) {
          toast.error("Escolha o que aconteceu.");
          return;
        }
        const comNova = motivoRemarcacao === "pediu_remarcar" || temNova;
        onConfirmar({
          remarcacao: { motivo: motivoRemarcacao, nova: comNova ? paraReuniao(nova) : null },
        });
        return;
      }
      case "proposta": {
        const v = parseBRLInput(valorTexto);
        onConfirmar({ valorProposta: v > 0 ? v : null });
        return;
      }
      case "ganho":
        onConfirmar({ valorFechamento: parseBRLInput(valorTexto) });
        return;
      case "motivo": {
        if (motivo && ehOutro(motivo)) {
          const t = outroTexto.trim();
          if (!t) {
            toast.error("Descreva o motivo.");
            return;
          }
          onConfirmar({ motivo: t });
          return;
        }
        onConfirmar({ motivo });
        return;
      }
      default:
        onConfirmar({});
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <DialogHeader>
        <DialogTitle>Mover para {destino.titulo}</DialogTitle>
        <DialogDescription>
          {lead.nome}
          {lead.empresa ? ` (${lead.empresa})` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {exigencia === "reuniao" && (
          <>
            <CamposReuniao valor={reuniao} onChange={setReuniao} convite={lead.email} />
            <p className="text-xs text-muted-foreground">
              O evento é criado na agenda da contato@ com Meet e notificações 1 h, 30 min e 10 min
              antes.
            </p>
          </>
        )}

        {exigencia === "remarcacao" && (
          <>
            {lead.reuniao_em && (
              <p className="text-sm text-muted-foreground">
                Reunião atual:{" "}
                <span className="font-medium text-foreground">
                  {formatarDataHora(lead.reuniao_em)}
                </span>
              </p>
            )}
            <div className="grid gap-2">
              <Label>O que aconteceu?</Label>
              <RadioGroup
                value={motivoRemarcacao ?? ""}
                onValueChange={(v) => setMotivoRemarcacao(v as MotivoRemarcacao)}
                className="gap-2.5"
              >
                {MOTIVOS_REMARCACAO.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <RadioGroupItem value={m.id} id={`${id}-${m.id}`} />
                    <Label htmlFor={`${id}-${m.id}`} className="cursor-pointer font-normal">
                      {m.rotulo}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {motivoRemarcacao === "pediu_remarcar" && (
              <fieldset className="grid gap-3 rounded-lg border border-border/60 p-3">
                <legend className="px-1 text-sm font-medium">Nova data e hora (obrigatório)</legend>
                <CamposReuniao valor={nova} onChange={setNova} convite={lead.email} />
                <p className="text-xs text-muted-foreground">
                  O evento da agenda é movido para a nova data, com o mesmo Meet.
                </p>
              </fieldset>
            )}

            {(motivoRemarcacao === "no_show" || motivoRemarcacao === "nao_confirmou") && (
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Switch id={`${id}-tem-nova`} checked={temNova} onCheckedChange={setTemNova} />
                  <Label htmlFor={`${id}-tem-nova`} className="cursor-pointer">
                    Já tem nova data?
                  </Label>
                </div>
                {temNova ? (
                  <>
                    <CamposReuniao valor={nova} onChange={setNova} convite={lead.email} />
                    <p className="text-xs text-muted-foreground">
                      O evento da agenda é movido para a nova data, com o mesmo Meet.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {motivoRemarcacao === "no_show"
                      ? "A reunião sai do card; o evento que já passou continua na agenda."
                      : "A reunião e o evento da agenda ficam como estão."}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {(exigencia === "proposta" || exigencia === "ganho") && (
          <div className="grid gap-2">
            <Label htmlFor={`${id}-valor`}>
              {exigencia === "ganho" ? "Valor fechado" : "Valor da proposta (opcional)"}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id={`${id}-valor`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0,00"
                className="pl-9"
                value={valorTexto}
                onChange={(e) =>
                  setValorTexto(
                    parseBRLInput(e.target.value) > 0 ? maskBRLInput(e.target.value) : "",
                  )
                }
              />
            </div>
            {exigencia === "ganho" && !lead.valor_fechamento && lead.valor_proposta ? (
              <p className="text-xs text-muted-foreground">
                Preenchido com o valor da proposta. Ajuste se fechou por outro valor.
              </p>
            ) : null}
          </div>
        )}

        {exigencia === "motivo" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-motivo`}>Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id={`${id}-motivo`}>
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivos.map((m, i) => (
                    <SelectItem key={`${i}-${m}`} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {motivo && ehOutro(motivo) && (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-outro`}>Qual motivo?</Label>
                <Input
                  id={`${id}-outro`}
                  autoFocus
                  placeholder="Descreva o motivo"
                  value={outroTexto}
                  onChange={(e) => setOutroTexto(e.target.value)}
                />
              </div>
            )}
            {reuniaoFutura && lead.reuniao_em && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {lead.evento_google_id
                  ? `A reunião de ${formatarDataHora(lead.reuniao_em)} será cancelada na agenda.`
                  : `A reunião de ${formatarDataHora(lead.reuniao_em)} será desmarcada.`}
              </p>
            )}
          </>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Confirmar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
