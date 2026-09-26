// Ficha do lead: painel lateral (tela cheia no celular) com ações rápidas, gestão, reunião, dados, rastreamento,
// notas e histórico. Tudo passa pelo contexto do CRM (`useCrm`); campos salvam ao sair do campo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import * as Collapsible from "@radix-ui/react-collapsible";
import { toast } from "sonner";
import {
  CalendarClock, Check, ChevronDown, CircleCheck, Copy, Globe, History, Instagram, ListPlus, MapPin, MessageCircle,
  NotebookPen, Phone, Radar, RefreshCw, Trash2, TriangleAlert, UserPlus, UserRound, Video,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DemandaForm, type DemandaFormValues } from "@/components/DemandaForm";
import { supabase } from "@/integrations/supabase/client";
import { useDemandaColunas, type KanbanColumnDef } from "@/lib/demandaColunas";
import { useAgencias } from "@/lib/agencias";
import { linkMeetNaConta } from "@/lib/agendaEvento";
import { cn } from "@/lib/utils";
import type { EventoCrm, LeadCrm, Trafego } from "@/lib/crmTipos";
import {
  emailValido, FAIXAS_FATURAMENTO, FAIXAS_INVESTIMENTO, MOTIVOS_REMARCACAO, rotuloFaixa, type Faixa,
} from "@/lib/crmColunas";
import {
  camposDeIso, DIAS_SEMANA, formatarData, formatarDataHora, formatarHora, formatarReais, isoDeCampos, mesmoDiaSP,
  partesSP,
} from "@/lib/crmFormato";
import { escopoDoTipo } from "@/lib/crmTentativas";
import { formatarTelefone, linkWhatsapp, normalizarTelefone, problemaTelefone } from "@/lib/crmWhatsapp";
import { useCrm } from "@/components/crm/CrmContexto";
import { BotaoTentativa } from "@/components/crm/BotaoTentativa";
import { PontosContato } from "@/components/crm/PontosContato";
import { MoverMenu } from "@/components/crm/MoverMenu";
import { CamposReuniao, duracaoPadraoReuniao } from "@/components/crm/CamposReuniao";

/** Valor do Select para "nenhum" (o Radix não aceita valor vazio). */
const NENHUM = "__nenhum__";
/** Usuário padrão das demandas quando não há sessão (igual à página antiga de Prospecção). */
const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

export function FichaLead() {
  const { fichaId, abrirFicha, leads, carregando } = useCrm();
  // Colunas das Demandas carregadas uma vez com a página (como na Prospecção antiga)
  const { colunas: colunasDemanda } = useDemandaColunas();
  const lead = fichaId ? leads.find((l) => l.id === fichaId) ?? null : null;
  // Mantém o último lead na tela durante a animação de fechar
  const ultimo = useRef<LeadCrm | null>(null);
  if (lead) ultimo.current = lead;
  const mostrado = lead ?? ultimo.current;

  useEffect(() => {
    if (fichaId && !lead && !carregando) abrirFicha(null);
  }, [fichaId, lead, carregando, abrirFicha]);

  return (
    <Sheet open={!!lead} onOpenChange={(aberto) => { if (!aberto) abrirFicha(null); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {mostrado && <ConteudoFicha key={mostrado.id} lead={mostrado} colunasDemanda={colunasDemanda} />}
      </SheetContent>
    </Sheet>
  );
}

function ConteudoFicha({ lead, colunasDemanda }: { lead: LeadCrm; colunasDemanda: KanbanColumnDef[] }) {
  const { colunaDoLead } = useCrm();
  const coluna = colunaDoLead(lead);
  const escopo = escopoDoTipo(coluna.tipo);

  return (
    <div className="flex flex-col">
      <Cabecalho lead={lead} />
      <div className="space-y-7 p-4 pb-10 sm:p-6">
        <AcoesRapidas lead={lead} />

        <Secao titulo="Gestão" icone={<CalendarClock />}>
          <ProximoContato lead={lead} />
          <ReuniaoBloco lead={lead} />
          {/* Os dois já trazem o próprio título; somem quando não se aplicam */}
          {escopo && (
            <Bloco>
              <BotaoTentativa lead={lead} />
            </Bloco>
          )}
          {lead.reuniao_em && (
            <Bloco>
              <PontosContato lead={lead} />
            </Bloco>
          )}
          <Resumo lead={lead} />
        </Secao>

        <Secao titulo="Dados" icone={<UserRound />}>
          <Dados lead={lead} />
        </Secao>

        <Rastreamento lead={lead} />

        <Secao titulo="Notas e histórico" icone={<History />}>
          <NotasHistorico lead={lead} />
        </Secao>

        <AcoesRodape lead={lead} colunasDemanda={colunasDemanda} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Estrutura

function Secao({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
        {icone}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Bloco({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border p-3">{children}</div>;
}

async function copiar(texto: string, aviso = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cabeçalho: nome, coluna (mover) e etiqueta

const OPCOES_TRAFEGO: { id: Trafego; rotulo: string }[] = [
  { id: "organico", rotulo: "Orgânico" },
  { id: "pago", rotulo: "Pago" },
];

function Cabecalho({ lead }: { lead: LeadCrm }) {
  const { colunaDoLead, salvarCampos } = useCrm();
  const coluna = colunaDoLead(lead);

  const salvarNome = (input: HTMLInputElement) => {
    const nome = input.value.trim();
    if (!nome) {
      toast.error("O nome não pode ficar vazio.");
      input.value = lead.nome;
      return;
    }
    if (nome !== lead.nome) void salvarCampos(lead, { nome }, `Nome alterado para ${nome}`);
  };

  return (
    <div className="space-y-3 border-b bg-muted/30 p-4 pr-14 sm:p-6 sm:pr-14">
      <SheetTitle className="sr-only">{lead.nome}</SheetTitle>
      <SheetDescription className="sr-only">Ficha do lead: gestão, reunião, dados, rastreamento, notas e histórico.</SheetDescription>
      <input
        key={`nome:${lead.nome}`}
        aria-label="Nome do lead"
        defaultValue={lead.nome}
        onBlur={(e) => salvarNome(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="-mx-1 w-full rounded-md bg-transparent px-1 text-xl font-semibold outline-none hover:bg-muted/60 focus:bg-background focus:ring-2 focus:ring-ring/40"
      />
      <div className="flex flex-wrap items-center gap-2">
        <MoverMenu lead={lead}>
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" title="Mover para outra coluna">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: coluna.hex }} aria-hidden />
            {coluna.titulo}
            <ChevronDown className="opacity-60" />
          </Button>
        </MoverMenu>
        <div role="group" aria-label="Etiqueta do lead" className="inline-flex rounded-lg border bg-background p-0.5">
          {OPCOES_TRAFEGO.map((o) => {
            const ativo = lead.trafego === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  if (!ativo) void salvarCampos(lead, { trafego: o.id }, `Etiqueta alterada para ${o.rotulo}`);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  ativo
                    ? o.id === "pago"
                      ? "bg-violet-600 text-white"
                      : "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ativo && <Check className="size-3" aria-hidden />}
                {o.rotulo}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {lead.coluna_desde ? `Nesta coluna desde ${formatarDataHora(lead.coluna_desde)} · ` : ""}
        Cadastrado em {formatarData(lead.created_at)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Ações rápidas

function urlExterna(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/\s/.test(t) || !t.includes(".")) return null;
  return `https://${t}`;
}

function urlInstagram(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/instagram\.com/i.test(t)) return urlExterna(t);
  const usuario = t.replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]+$/.test(usuario) ? `https://instagram.com/${usuario}` : null;
}

function urlGoogleNegocio(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return urlExterna(t) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t)}`;
}

function LinkExterno({ href, icone, children }: { href: string; icone: ReactNode; children: ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {icone}
        {children}
      </a>
    </Button>
  );
}

function AcoesRapidas({ lead }: { lead: LeadCrm }) {
  const wa = linkWhatsapp(lead.telefone);
  const problema = problemaTelefone(lead.telefone);
  const tel = normalizarTelefone(lead.telefone);
  const site = urlExterna(lead.site);
  const insta = urlInstagram(lead.instagram);
  const gmn = urlGoogleNegocio(lead.google_meu_negocio);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {wa ? (
        <Button asChild size="sm" className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="size-3.5" aria-hidden />
          WhatsApp indisponível: {problema ?? "telefone inválido"}
        </span>
      )}
      {tel && (
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <a href={`tel:+${tel}`}>
            <Phone />
            Ligar
          </a>
        </Button>
      )}
      {lead.telefone?.trim() && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void copiar(formatarTelefone(lead.telefone), "Telefone copiado")}
        >
          <Copy />
          Copiar telefone
        </Button>
      )}
      {site && <LinkExterno href={site} icone={<Globe />}>Site</LinkExterno>}
      {insta && <LinkExterno href={insta} icone={<Instagram />}>Instagram</LinkExterno>}
      {gmn && <LinkExterno href={gmn} icone={<MapPin />}>Google Meu Negócio</LinkExterno>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Gestão: próximo contato, reunião e resumo

function ProximoContato({ lead }: { lead: LeadCrm }) {
  const { salvarCampos } = useCrm();
  const [campos, setCampos] = useState(() => camposDeIso(lead.proximo_contato_em));
  useEffect(() => setCampos(camposDeIso(lead.proximo_contato_em)), [lead.proximo_contato_em]);

  const limpar = () => {
    setCampos({ data: "", hora: "" });
    if (lead.proximo_contato_em) void salvarCampos(lead, { proximo_contato_em: null }, "Próximo contato removido");
  };

  const salvar = () => {
    if (!campos.data) {
      if (lead.proximo_contato_em) limpar();
      return;
    }
    const hora = campos.hora || "10:00";
    const iso = isoDeCampos(campos.data, hora);
    if (!iso) return;
    if (hora !== campos.hora) setCampos({ data: campos.data, hora });
    if (lead.proximo_contato_em && new Date(lead.proximo_contato_em).getTime() === new Date(iso).getTime()) return;
    void salvarCampos(lead, { proximo_contato_em: iso }, `Próximo contato: ${formatarDataHora(iso)}`);
  };

  const quando = lead.proximo_contato_em ? new Date(lead.proximo_contato_em) : null;
  const agora = new Date();
  const vencido = !!quando && quando.getTime() < agora.getTime();
  const hoje = !!quando && !vencido && mesmoDiaSP(quando, agora);

  return (
    <div
      className="space-y-1.5"
      onBlur={(e) => {
        // Salva quando o foco sai do grupo (data + hora), não ao pular da data para a hora
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) salvar();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="ficha-proximo-data" className="text-xs">Próximo contato</Label>
        {vencido && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" aria-hidden />
            Vencido
          </span>
        )}
        {hoje && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Hoje</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="ficha-proximo-data"
          type="date"
          value={campos.data}
          onChange={(e) => setCampos((c) => ({ ...c, data: e.target.value }))}
          className="w-auto min-w-[9.5rem] flex-1"
        />
        <Input
          type="time"
          aria-label="Hora do próximo contato"
          value={campos.hora}
          onChange={(e) => setCampos((c) => ({ ...c, hora: e.target.value }))}
          className="w-28"
        />
        {(lead.proximo_contato_em || campos.data) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={limpar}
          >
            Limpar
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Salva ao sair do campo. Sem hora, fica às 10:00.</p>
    </div>
  );
}

interface ValorReuniao { data: string; hora: string; duracaoMin: number }

function valorReuniaoDo(lead: LeadCrm): ValorReuniao {
  const c = camposDeIso(lead.reuniao_em);
  return {
    data: c.data,
    hora: c.hora,
    duracaoMin: lead.reuniao_em ? lead.reuniao_duracao_min ?? duracaoPadraoReuniao() : duracaoPadraoReuniao(),
  };
}

function ReuniaoBloco({ lead }: { lead: LeadCrm }) {
  const { alterarReuniao } = useCrm();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<ValorReuniao>(() => valorReuniaoDo(lead));
  const [salvando, setSalvando] = useState(false);

  const abrir = () => {
    setValor(valorReuniaoDo(lead));
    setEditando(true);
  };

  const salvar = async () => {
    const em = isoDeCampos(valor.data, valor.hora);
    if (!em) {
      toast.error("Informe a data e a hora da reunião.");
      return;
    }
    setSalvando(true);
    const ok = await alterarReuniao(lead, { em, duracaoMin: valor.duracaoMin });
    setSalvando(false);
    if (ok) setEditando(false);
  };

  const inicio = lead.reuniao_em ? new Date(lead.reuniao_em) : null;
  const passou = !!inicio && inicio.getTime() < Date.now();

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Video className="size-3.5" aria-hidden />
          Reunião
        </p>
        {!editando && (
          <Button variant={inicio ? "ghost" : "outline"} size="sm" className="h-7 text-xs" onClick={abrir}>
            {inicio ? "Alterar" : "Marcar reunião"}
          </Button>
        )}
      </div>

      {inicio ? (
        <>
          <p className="text-sm font-medium">
            {DIAS_SEMANA[partesSP(inicio).diaSemana]}, {formatarDataHora(inicio)} · {lead.reuniao_duracao_min ?? 30} min
            {passou && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(já passou)</span>}
          </p>
          {lead.evento_meet_link && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
                <a href={linkMeetNaConta(lead.evento_meet_link)} target="_blank" rel="noopener noreferrer">
                  <Video />
                  Entrar no Meet
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void copiar(lead.evento_meet_link!, "Link do Meet copiado")}
              >
                <Copy />
                Copiar link
              </Button>
            </div>
          )}
        </>
      ) : (
        !editando && <p className="text-xs text-muted-foreground">Sem reunião marcada.</p>
      )}

      <StatusAgenda lead={lead} />

      {editando && (
        <div className="space-y-3 border-t pt-3">
          <CamposReuniao valor={valor} onChange={setValor} convite={lead.email} />
          <p className="text-xs text-muted-foreground">
            O evento é {lead.evento_google_id ? "atualizado" : "criado"} na agenda da contato@ com Meet e notificações
            1 h, 30 min e 10 min antes.{!inicio && " Marcar aqui não muda a coluna do lead."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar reunião"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusAgenda({ lead }: { lead: LeadCrm }) {
  const { tentarAgendaDeNovo } = useCrm();
  const [tentando, setTentando] = useState(false);

  const tentar = async () => {
    setTentando(true);
    await tentarAgendaDeNovo(lead);
    setTentando(false);
  };

  const botao = (rotulo: string) => (
    <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={tentando} onClick={() => void tentar()}>
      <RefreshCw className={cn("size-3", tentando && "animate-spin")} />
      {tentando ? "Tentando…" : rotulo}
    </Button>
  );

  if (lead.evento_status === "erro") {
    return (
      <div className="space-y-1 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
        <p className="flex items-start gap-1.5 font-medium">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {lead.evento_google_id ? "Evento não atualizado na agenda" : "Evento não criado na agenda"}
          {lead.evento_erro ? ` — ${lead.evento_erro}` : ""}
        </p>
        {botao("Tentar de novo")}
      </div>
    );
  }
  if (!lead.reuniao_em) return null;
  if (lead.evento_google_id) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Evento na agenda da contato@
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <span>Sem evento na agenda.</span>
      {botao("Criar evento")}
    </div>
  );
}

const rotuloRemarcacao = (id: string) => MOTIVOS_REMARCACAO.find((m) => m.id === id)?.rotulo ?? id;

function Resumo({ lead }: { lead: LeadCrm }) {
  const itens: [string, string][] = [
    ["Tentativas de follow-up", String(lead.follow_up ?? 0)],
    ["Tentativas de proposta", String(lead.follow_up_proposta ?? 0)],
    ["Remarcações", String(lead.remarcacoes ?? 0)],
    ["No-shows", String(lead.no_shows ?? 0)],
    ["Compareceu", lead.compareceu ? "Sim" : "Não"],
    ["Valor da proposta", lead.valor_proposta != null ? formatarReais(lead.valor_proposta) : "—"],
    ["Valor fechado", lead.valor_fechamento != null ? formatarReais(lead.valor_fechamento) : "—"],
  ];
  if (lead.motivo_remarcacao) itens.push(["Motivo da remarcação", rotuloRemarcacao(lead.motivo_remarcacao)]);
  if (lead.motivo_perda) itens.push(["Motivo da perda", lead.motivo_perda]);
  if (lead.motivo_desqualificacao) itens.push(["Motivo da desqualificação", lead.motivo_desqualificacao]);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd className="break-words font-medium">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Dados e rastreamento (salvar ao sair do campo)

type CampoTexto =
  | "empresa" | "nicho" | "cidade" | "telefone" | "email" | "site" | "instagram" | "google_meu_negocio" | "observacoes"
  | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "fbclid" | "gclid" | "pagina_entrada"
  | "referencia";

interface CampoDef {
  campo: CampoTexto;
  rotulo: string;
  /** Rótulo feminino ("alterada") no histórico */
  fem?: boolean;
  placeholder?: string;
  tipo?: "text" | "email" | "tel";
  inputMode?: "text" | "email" | "tel" | "url";
  largo?: boolean;
  multilinha?: boolean;
  validar?: (v: string | null) => string | null;
}

const CAMPOS_DADOS: CampoDef[] = [
  { campo: "empresa", rotulo: "Empresa", fem: true },
  { campo: "nicho", rotulo: "Nicho", placeholder: "Ex.: Estética" },
  { campo: "cidade", rotulo: "Cidade/UF", fem: true, placeholder: "Ex.: Campinas/SP" },
  { campo: "telefone", rotulo: "Telefone/WhatsApp", tipo: "tel", inputMode: "tel", placeholder: "(11) 91234-5678" },
  {
    campo: "email", rotulo: "E-mail", tipo: "email", inputMode: "email", placeholder: "nome@empresa.com.br",
    validar: (v) => (v && !emailValido(v) ? "E-mail inválido. Confira e tente de novo." : null),
  },
  { campo: "site", rotulo: "Site/LP", inputMode: "url", placeholder: "empresa.com.br" },
  { campo: "instagram", rotulo: "Instagram", placeholder: "@perfil" },
  { campo: "google_meu_negocio", rotulo: "Google Meu Negócio", placeholder: "Link ou nome do perfil" },
];

const CAMPO_DESCRICAO: CampoDef = {
  campo: "observacoes", rotulo: "Descrição", fem: true, largo: true, multilinha: true,
  placeholder: "Quem é o lead, o que ele precisa, contexto da conversa…",
};

const CAMPOS_RASTREAMENTO: CampoDef[] = [
  { campo: "utm_source", rotulo: "utm_source" },
  { campo: "utm_medium", rotulo: "utm_medium" },
  { campo: "utm_campaign", rotulo: "utm_campaign" },
  { campo: "utm_content", rotulo: "utm_content" },
  { campo: "utm_term", rotulo: "utm_term" },
  { campo: "fbclid", rotulo: "fbclid" },
  { campo: "gclid", rotulo: "gclid" },
  { campo: "pagina_entrada", rotulo: "Página de entrada", fem: true, inputMode: "url", largo: true },
  { campo: "referencia", rotulo: "Referência", fem: true, largo: true },
];

function textoEdicao(def: CampoDef, v: string | null): string {
  const fim = def.fem ? "a" : "o";
  if (!v) return `${def.rotulo} apagad${fim}`;
  if (def.multilinha) return `${def.rotulo} alterad${fim}`;
  const curto = v.length > 80 ? `${v.slice(0, 77)}…` : v;
  return `${def.rotulo} alterad${fim}: ${curto}`;
}

function CampoLead({ lead, def }: { lead: LeadCrm; def: CampoDef }) {
  const { salvarCampos } = useCrm();
  const atual = lead[def.campo] ?? "";
  const id = `ficha-${def.campo}`;

  const salvar = (bruto: string) => {
    const v = bruto.trim() || null;
    if (v === (lead[def.campo] ?? null)) return;
    const erro = def.validar?.(v);
    if (erro) {
      toast.error(erro);
      return;
    }
    void salvarCampos(lead, { [def.campo]: v } as Partial<LeadCrm>, textoEdicao(def, v));
  };

  return (
    <div className={cn("space-y-1.5", def.largo && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-xs">{def.rotulo}</Label>
      {def.multilinha ? (
        <Textarea
          // A chave inclui o valor: se a gravação falhar (valor volta) ou mudar por fora, o campo mostra o atual
          key={`${def.campo}:${atual}`}
          id={id}
          defaultValue={atual}
          placeholder={def.placeholder}
          onBlur={(e) => salvar(e.currentTarget.value)}
          className="min-h-[96px]"
        />
      ) : (
        <Input
          key={`${def.campo}:${atual}`}
          id={id}
          type={def.tipo ?? "text"}
          inputMode={def.inputMode}
          defaultValue={atual}
          placeholder={def.placeholder}
          onBlur={(e) => salvar(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
    </div>
  );
}

function SelectLead({
  id, rotulo, valor, vazio, opcoes, onChange,
}: {
  id: string;
  rotulo: string;
  valor: string | null;
  vazio: string;
  opcoes: Faixa[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Select value={valor ?? NENHUM} onValueChange={(v) => onChange(v === NENHUM ? null : v)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={vazio} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUM}>{vazio}</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.rotulo}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Dados({ lead }: { lead: LeadCrm }) {
  const { salvarCampos } = useCrm();
  const { agencias, meta, label } = useAgencias();

  const opcoesAgencia: Faixa[] = agencias.map((a) => ({ id: a.id, rotulo: a.label }));
  // Agência inativa já gravada no lead continua aparecendo
  const atual = lead.agencia_destino ? meta(lead.agencia_destino) : undefined;
  if (lead.agencia_destino && !opcoesAgencia.some((o) => o.id === lead.agencia_destino)) {
    opcoesAgencia.push({ id: lead.agencia_destino, rotulo: atual?.label ?? lead.agencia_destino });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CAMPOS_DADOS.map((def) => (
        <CampoLead key={def.campo} lead={lead} def={def} />
      ))}
      <SelectLead
        id="ficha-faturamento"
        rotulo="Faturamento mensal"
        valor={lead.faturamento_faixa}
        vazio="Não informado"
        opcoes={FAIXAS_FATURAMENTO}
        onChange={(v) =>
          void salvarCampos(lead, { faturamento_faixa: v }, `Faturamento mensal: ${rotuloFaixa(FAIXAS_FATURAMENTO, v)}`)
        }
      />
      <SelectLead
        id="ficha-investimento"
        rotulo="Investimento em anúncios"
        valor={lead.investimento_faixa}
        vazio="Não informado"
        opcoes={FAIXAS_INVESTIMENTO}
        onChange={(v) =>
          void salvarCampos(
            lead,
            { investimento_faixa: v },
            `Investimento em anúncios: ${rotuloFaixa(FAIXAS_INVESTIMENTO, v)}`,
          )
        }
      />
      <SelectLead
        id="ficha-agencia"
        rotulo="Agência de destino"
        valor={lead.agencia_destino}
        vazio="Nenhuma"
        opcoes={opcoesAgencia}
        onChange={(v) =>
          void salvarCampos(
            lead,
            { agencia_destino: v },
            v ? `Agência de destino: ${label(v)}` : "Agência de destino removida",
          )
        }
      />
      <CampoLead lead={lead} def={CAMPO_DESCRICAO} />
    </div>
  );
}

function Rastreamento({ lead }: { lead: LeadCrm }) {
  const [aberto, setAberto] = useState(false);
  const preenchidos = CAMPOS_RASTREAMENTO.filter((d) => (lead[d.campo] ?? "").trim()).length;

  return (
    <Collapsible.Root open={aberto} onOpenChange={setAberto}>
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Radar className="size-3.5" aria-hidden />
            Rastreamento (UTMs)
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {preenchidos === 0 ? "Nada preenchido" : preenchidos === 1 ? "1 preenchido" : `${preenchidos} preenchidos`}
            <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} aria-hidden />
          </span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS_RASTREAMENTO.map((def) => (
            <CampoLead key={def.campo} lead={lead} def={def} />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Notas e histórico

interface EstiloEvento { rotulo: string; borda: string; texto: string }

const NEUTRO = { borda: "border-l-border", texto: "text-muted-foreground" };
const AZUL = { borda: "border-l-blue-500", texto: "text-blue-600 dark:text-blue-400" };
const VERMELHO = { borda: "border-l-red-500", texto: "text-red-600 dark:text-red-400" };
const VERDE = { borda: "border-l-emerald-500", texto: "text-emerald-600 dark:text-emerald-400" };
const VIOLETA = { borda: "border-l-violet-500", texto: "text-violet-600 dark:text-violet-400" };
const AMBAR = { borda: "border-l-amber-500", texto: "text-amber-600 dark:text-amber-400" };

function estiloEvento(e: EventoCrm): EstiloEvento {
  switch (e.tipo) {
    case "tentativa":
      return { rotulo: "tentativa", ...AZUL };
    case "reuniao_resultado":
      return e.dados?.compareceu ? { rotulo: "compareceu", ...VERDE } : { rotulo: "no-show", ...VERMELHO };
    case "perda":
      return { rotulo: "perda", ...VERMELHO };
    case "ganho":
      return { rotulo: "ganho", ...VERDE };
    case "cliente_cadastrado":
      return { rotulo: "cliente", ...VERDE };
    case "agenda":
      return { rotulo: "agenda", ...VIOLETA };
    case "reuniao":
      return { rotulo: "reunião", ...VIOLETA };
    case "nota":
      return { rotulo: "nota", ...AMBAR };
    case "remarcacao":
      return { rotulo: "remarcação", ...NEUTRO };
    case "desqualificacao":
      return { rotulo: "desqualificação", ...NEUTRO };
    case "mudanca_coluna":
      return { rotulo: "coluna", ...NEUTRO };
    case "ponto_contato":
      return { rotulo: "ponto de contato", ...NEUTRO };
    case "criacao":
      return { rotulo: "criação", ...NEUTRO };
    case "edicao":
      return { rotulo: "edição", ...NEUTRO };
    case "em_massa":
      return { rotulo: "em massa", ...NEUTRO };
    default:
      return { rotulo: String(e.tipo), ...NEUTRO };
  }
}

function NotasHistorico({ lead }: { lead: LeadCrm }) {
  const { eventos, adicionarNota } = useCrm();
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Mais recentes primeiro pela data gravada (duas ações seguidas podem voltar do banco fora de ordem)
  const doLead = useMemo(
    () => eventos.filter((e) => e.lead_id === lead.id).sort((x, y) => y.created_at.localeCompare(x.created_at)),
    [eventos, lead.id],
  );

  const adicionar = async () => {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    await adicionarNota(lead, texto);
    setSalvando(false);
    setTexto("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ficha-nota" className="sr-only">Nova nota</Label>
        <Textarea
          id="ficha-nota"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void adicionar();
            }
          }}
          placeholder="Escreva uma nota sobre o lead…"
          className="min-h-[72px]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground max-sm:hidden">Ctrl+Enter adiciona</span>
          <Button size="sm" className="ml-auto h-8 gap-1.5 text-xs" disabled={!texto.trim() || salvando} onClick={() => void adicionar()}>
            <NotebookPen />
            {salvando ? "Salvando…" : "Adicionar nota"}
          </Button>
        </div>
      </div>

      <ol className="space-y-2">
        {doLead.map((e) => {
          const est = estiloEvento(e);
          return (
            <li key={e.id} className={cn("rounded-md border border-l-4 bg-card px-3 py-2", est.borda)}>
              <div className="flex flex-wrap items-center gap-x-2 text-[10px]">
                <span className={cn("font-semibold uppercase tracking-wide", est.texto)}>{est.rotulo}</span>
                <span className="text-muted-foreground">
                  {formatarData(e.created_at)} {formatarHora(e.created_at)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs">{e.descricao}</p>
            </li>
          );
        })}
        <li className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Lead cadastrado em {formatarData(lead.created_at)}
        </li>
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Ações do rodapé: demanda de follow-up, cadastrar como cliente e excluir

function AcoesRodape({ lead, colunasDemanda }: { lead: LeadCrm; colunasDemanda: KanbanColumnDef[] }) {
  const { colunaDoLead, iniciarCadastroCliente, excluirLeads, abrirFicha } = useCrm();
  const [demandaAberta, setDemandaAberta] = useState(false);
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const ganho = colunaDoLead(lead).tipo === "ganho";
  const reuniaoFutura = !!lead.reuniao_em && new Date(lead.reuniao_em).getTime() > Date.now();

  const excluir = async () => {
    setExcluindo(true);
    await excluirLeads([lead.id]);
    setExcluindo(false);
    setExcluirAberto(false);
  };

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setDemandaAberta(true)}>
          <ListPlus />
          Criar demanda de follow-up
        </Button>
        {ganho && !lead.cliente_id && (
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
            onClick={() => iniciarCadastroCliente(lead)}
          >
            <UserPlus />
            Cadastrar como cliente
          </Button>
        )}
        {lead.cliente_id && (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-3.5" aria-hidden />
            Cliente cadastrado ·
            <Link to="/clientes" className="font-medium underline underline-offset-2" onClick={() => abrirFicha(null)}>
              ver em Clientes ativos
            </Link>
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto"
          onClick={() => setExcluirAberto(true)}
        >
          <Trash2 />
          Excluir lead
        </Button>
      </div>

      <DemandaFollowUp lead={lead} colunas={colunasDemanda} aberto={demandaAberta} onAberto={setDemandaAberta} />

      <AlertDialog open={excluirAberto} onOpenChange={(v) => !excluindo && setExcluirAberto(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {lead.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o lead e todo o histórico dele, e não tem volta.
              {reuniaoFutura && lead.evento_google_id
                ? " A reunião marcada é cancelada na agenda da contato@."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluindo}
              onClick={(e) => {
                e.preventDefault();
                void excluir();
              }}
            >
              {excluindo ? "Excluindo…" : "Excluir lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Mesmo fluxo da página antiga de Prospecção (`submitDemanda` + `DemandaForm`), ligado ao lead por `prospeccao_id`. */
function DemandaFollowUp({
  lead, colunas, aberto, onAberto,
}: {
  lead: LeadCrm;
  colunas: KanbanColumnDef[];
  aberto: boolean;
  onAberto: (v: boolean) => void;
}) {
  const [salvando, setSalvando] = useState(false);

  const submitDemanda = async (values: DemandaFormValues) => {
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || USUARIO_PADRAO;

      const sanitizedValues: any = { ...values };
      if (sanitizedValues.cliente_id === "" || sanitizedValues.cliente_id === "none") {
        sanitizedValues.cliente_id = null;
      }
      if (sanitizedValues.prazo === "") {
        sanitizedValues.prazo = null;
      }
      if (sanitizedValues.frequencia_dia_mes === "") {
        sanitizedValues.frequencia_dia_mes = null;
      }
      if (sanitizedValues.frequencia_intervalo_dias === "" || isNaN(sanitizedValues.frequencia_intervalo_dias)) {
        sanitizedValues.frequencia_intervalo_dias = null;
      }

      const { error } = await supabase.from("demandas").insert([{
        ...sanitizedValues,
        user_id: userId,
        prospeccao_id: lead.id,
      }]);
      if (error) throw error;
      toast.success("Demanda de follow-up criada!");
      onAberto(false);
    } catch {
      toast.error("Erro ao criar demanda");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agendar demanda de follow-up</DialogTitle>
          <DialogDescription>A demanda vai para a aba Demandas ligada a {lead.nome}.</DialogDescription>
        </DialogHeader>
        <DemandaForm
          clientes={[]}
          columns={colunas}
          initialValues={{
            titulo: `Follow-up: ${lead.nome}`,
            status: "fazer_amanha",
            prioridade: "alta",
          }}
          onSubmit={submitDemanda}
          loading={salvando}
        />
      </DialogContent>
    </Dialog>
  );
}
