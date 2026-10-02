// Banco de leads: as abas de leads da "Planilha CRM Mestra" dentro do CRM (spec 2026-10-01-banco-de-leads §8.2).
// Lê e grava em banco_leads; o Apps Script leva cada mudança à planilha e traz as de lá (Realtime).
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Filter, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MensagemBusca } from "@/components/MensagemBusca";
import { useCrm } from "@/components/crm/CrmContexto";
import { useBusca } from "@/lib/useBusca";
import * as crmDados from "@/lib/crmDados";
import { colunaInicial } from "@/lib/crmColunas";
import {
  chaveDoPapel,
  ehSim,
  ehValido,
  faixaDoFaturamento,
  filtrarBanco,
  FILTRO_BANCO_PADRAO,
  leadCrmDoBanco,
  NAO,
  nomeDoLead,
  opcoesDeFiltro,
  SIM,
  textoDeBusca,
  type AbaBanco,
  type FiltroBanco,
  type FiltroSimNao,
  type LeadBanco,
} from "@/lib/bancoLeads";
import { criarLeadBanco, definirCampoBanco, excluirLeadsBanco, ligarAoCrm, type StatusPlanilha } from "@/lib/bancoLeadsDados";
import { useBancoLeads } from "./useBancoLeads";
import { BancoTabela } from "./BancoTabela";
import { BancoFicha } from "./BancoFicha";
import { BancoNovoLead } from "./BancoNovoLead";
import { BancoSelecaoBarra } from "./BancoSelecaoBarra";
import { cn } from "@/lib/utils";

const TODAS = "todas";

function lerLocal(chave: string, padrao: string): string {
  try {
    return window.localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // navegador sem armazenamento: só não lembra a escolha
  }
}

function comValor(dados: Record<string, string>, chave: string, valor: string): Record<string, string> {
  const v = valor.trim();
  const out = { ...dados };
  if (v) out[chave] = v;
  else delete out[chave];
  return out;
}

/** Ações do Banco de leads: gravam no banco (a planilha recebe pelo Apps Script) e já mudam a tela. */
function useAcoesBanco(abasPorId: Map<string, AbaBanco>, leads: LeadBanco[], setLeads: Dispatch<SetStateAction<LeadBanco[]>>) {
  const crm = useCrm();
  const trocar = useCallback(
    (id: string, f: (l: LeadBanco) => LeadBanco) => setLeads((prev) => prev.map((l) => (l.id === id ? f(l) : l))),
    [setLeads],
  );

  const editar = useCallback(
    async (lead: LeadBanco, chave: string, valor: string) => {
      const anterior = lead.dados[chave] ?? "";
      if (anterior === valor.trim()) return;
      const aba = abasPorId.get(lead.aba_id);
      trocar(lead.id, (l) => ({ ...l, dados: comValor(l.dados, chave, valor) }));
      try {
        await definirCampoBanco(lead.id, chave, valor);
        if (aba && lead.lead_crm_id && chave === chaveDoPapel(aba, "faturamento")) {
          const faixa = faixaDoFaturamento(valor);
          if (faixa) await crmDados.atualizarLead(lead.lead_crm_id, { faturamento_faixa: faixa });
        }
      } catch (e: any) {
        toast.error("Não foi possível salvar: " + (e?.message ?? e));
        trocar(lead.id, (l) => ({ ...l, dados: comValor(l.dados, chave, anterior) }));
      }
    },
    [abasPorId, trocar],
  );

  const enviarAoCrm = useCallback(
    async (lead: LeadBanco, avisar = true): Promise<boolean> => {
      const aba = abasPorId.get(lead.aba_id);
      if (!aba || lead.lead_crm_id) return false;
      if (!ehValido(lead, aba)) {
        if (avisar) toast.error(`${nomeDoLead(lead, aba)} está como Lead válido = Não. Mude para Sim antes de enviar ao CRM.`);
        return false;
      }
      const coluna = crm.colunas.find((c) => c.id === "primeiro_contato") ?? colunaInicial(crm.colunas);
      if (!coluna) {
        toast.error("O CRM não tem colunas.");
        return false;
      }
      const k1 = chaveDoPapel(aba, "primeira_msg");
      try {
        const { lead: novo } = await crmDados.criarLead({ ...leadCrmDoBanco(lead, aba), primeiro_contato_em: new Date().toISOString() }, coluna);
        await ligarAoCrm(lead.id, novo.id, k1, SIM);
        trocar(lead.id, (l) => ({ ...l, lead_crm_id: novo.id, dados: k1 ? comValor(l.dados, k1, SIM) : l.dados }));
        if (avisar) toast.success(`${nomeDoLead(lead, aba)} entrou no CRM em ${coluna.titulo}.`);
        return true;
      } catch (e: any) {
        toast.error("Não foi possível enviar ao CRM: " + (e?.message ?? e));
        return false;
      }
    },
    [abasPorId, crm.colunas, trocar],
  );

  const tirarDoCrm = useCallback(
    async (lead: LeadBanco) => {
      if (!lead.lead_crm_id) return;
      const k1 = chaveDoPapel(abasPorId.get(lead.aba_id), "primeira_msg");
      await crm.excluirLeads([lead.lead_crm_id]);
      trocar(lead.id, (l) => ({ ...l, lead_crm_id: null, dados: k1 ? comValor(l.dados, k1, NAO) : l.dados }));
    },
    [abasPorId, crm, trocar],
  );

  const excluir = useCallback(
    async (ids: string[]) => {
      const fora = new Set(ids);
      const antes = leads;
      setLeads((prev) => prev.filter((l) => !fora.has(l.id)));
      try {
        await excluirLeadsBanco(ids);
        toast.success(ids.length === 1 ? "Lead excluído." : `${ids.length} leads excluídos.`);
      } catch (e: any) {
        setLeads(antes);
        toast.error("Não foi possível excluir: " + (e?.message ?? e));
      }
    },
    [leads, setLeads],
  );

  const criar = useCallback(
    async (aba: AbaBanco, dados: Record<string, string>): Promise<boolean> => {
      const kValido = chaveDoPapel(aba, "valido");
      const k1 = chaveDoPapel(aba, "primeira_msg");
      const completos = { ...(kValido ? { [kValido]: SIM } : {}), ...(k1 ? { [k1]: NAO } : {}), ...dados };
      const posicao = Math.max(1, ...leads.filter((l) => l.aba_id === aba.id).map((l) => l.posicao)) + 1;
      try {
        const novo = await criarLeadBanco(aba.id, completos, posicao);
        setLeads((prev) => (prev.some((l) => l.id === novo.id) ? prev : [...prev, novo]));
        toast.success(`Lead criado em ${aba.nome}. A planilha recebe em segundos.`);
        return true;
      } catch (e: any) {
        toast.error("Não foi possível criar: " + (e?.message ?? e));
        return false;
      }
    },
    [leads, setLeads],
  );

  const validoEmMassa = useCallback(
    async (alvo: LeadBanco[], valido: boolean) => {
      let feitos = 0;
      for (const l of alvo) {
        const k = chaveDoPapel(abasPorId.get(l.aba_id), "valido");
        if (!k) continue;
        await editar(l, k, valido ? SIM : NAO);
        feitos++;
      }
      toast.success(`${feitos} ${feitos === 1 ? "lead marcado" : "leads marcados"} como ${valido ? "válido" : "inválido"}.`);
    },
    [abasPorId, editar],
  );

  const enviarEmMassa = useCallback(
    async (alvo: LeadBanco[]) => {
      let ok = 0;
      let pulados = 0;
      for (const l of alvo) {
        if (l.lead_crm_id || !ehValido(l, abasPorId.get(l.aba_id))) {
          pulados++;
          continue;
        }
        if (await enviarAoCrm(l, false)) ok++;
      }
      toast.success(`${ok} ${ok === 1 ? "lead enviado" : "leads enviados"} ao CRM.${pulados ? ` ${pulados} já estavam lá ou são inválidos.` : ""}`);
    },
    [abasPorId, enviarAoCrm],
  );

  return { editar, enviarAoCrm, tirarDoCrm, excluir, criar, validoEmMassa, enviarEmMassa };
}

function SubAbas({
  abas,
  contagem,
  total,
  atual,
  onEscolher,
}: {
  abas: AbaBanco[];
  contagem: Map<string, number>;
  total: number;
  atual: string;
  onEscolher: (id: string) => void;
}) {
  const itens = [{ id: TODAS, nome: "Todas", n: total }, ...abas.map((a) => ({ id: a.id, nome: a.nome, n: contagem.get(a.id) ?? 0 }))];
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div role="tablist" aria-label="Abas da planilha" className="flex w-max gap-1.5 px-1">
        {itens.map((a) => {
          const ativa = atual === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => onEscolher(a.id)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                ativa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {a.nome}
              <span className={cn("tabular-nums", ativa ? "opacity-80" : "text-muted-foreground")}>{a.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusSync({ status }: { status: StatusPlanilha | null }) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTique((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!status?.conectada) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle size={13} /> A planilha ainda não está conectada
      </span>
    );
  }
  const em = status.ultima_conferencia_em ? new Date(status.ultima_conferencia_em).getTime() : null;
  const min = em === null ? null : Math.max(0, Math.round((Date.now() - em) / 60_000));
  const quando = min === null ? "ainda não conferida" : min < 1 ? "agora há pouco" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
  const problema = status.ok === false;
  const atrasado = min === null || min > 15;
  return (
    <span
      title={problema && status.erro ? `Última conferência com problema: ${status.erro}` : "Edições vão na hora; a planilha confere tudo a cada 5 minutos."}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", problema || atrasado ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
    >
      {problema || atrasado ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
      {problema ? `Conferência com problema ${quando}` : `Sincronizado com a planilha ${quando}`}
    </span>
  );
}

function MaisFiltros({
  opcoes,
  valores,
  onMudar,
}: {
  opcoes: { chave: string; titulo: string; valores: string[] }[];
  valores: Record<string, string>;
  onMudar: (v: Record<string, string>) => void;
}) {
  const ativos = Object.values(valores).filter(Boolean).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", ativos > 0 && "border-primary text-primary")}>
          <Filter size={13} /> Mais filtros{ativos ? ` (${ativos})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        {opcoes.map((o) => (
          <label key={o.chave} className="block space-y-1 text-xs">
            <span className="font-medium">{o.titulo}</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={valores[o.chave] ?? ""}
              onChange={(e) => onMudar({ ...valores, [o.chave]: e.target.value })}
            >
              <option value="">Todos</option>
              {o.valores.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        {ativos > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => onMudar({})}>
            Limpar estes filtros
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SeletorSimNao({ valor, onMudar, rotulo, opcoes }: { valor: FiltroSimNao; onMudar: (v: FiltroSimNao) => void; rotulo: string; opcoes: [string, string, string] }) {
  return (
    <Select value={valor} onValueChange={(v) => onMudar(v as FiltroSimNao)}>
      <SelectTrigger aria-label={rotulo} className="h-9 flex-1 min-w-[130px] text-xs sm:w-[150px] sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{opcoes[0]}</SelectItem>
        <SelectItem value="sim">{opcoes[1]}</SelectItem>
        <SelectItem value="nao">{opcoes[2]}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function BancoLeads({ onAbrirNoCrm }: { onAbrirNoCrm: (crmId: string) => void }) {
  const { abas, leads, setLeads, status, carregando, erro } = useBancoLeads();
  const crm = useCrm();
  const [abaAtual, setAbaAtual] = useState<string>(() => lerLocal("banco-leads-aba", TODAS));
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroBanco>(FILTRO_BANCO_PADRAO);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [saida, setSaida] = useState<LeadBanco | null>(null);

  const abasPorId = useMemo(() => new Map(abas.map((a) => [a.id, a])), [abas]);
  const aba = abaAtual === TODAS ? null : abasPorId.get(abaAtual) ?? null;
  const acoes = useAcoesBanco(abasPorId, leads, setLeads);

  useEffect(() => {
    if (abaAtual !== TODAS && abas.length > 0 && !abasPorId.has(abaAtual)) setAbaAtual(TODAS);
  }, [abaAtual, abas.length, abasPorId]);
  useEffect(() => {
    gravarLocal("banco-leads-aba", abaAtual);
    setFiltro((f) => ({ ...f, colunas: {} }));
    setSelecionados(new Set());
  }, [abaAtual]);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.aba_id, (m.get(l.aba_id) ?? 0) + 1);
    return m;
  }, [leads]);
  const daAba = useMemo(
    () => (aba ? leads.filter((l) => l.aba_id === aba.id) : leads.filter((l) => abasPorId.has(l.aba_id))),
    [leads, aba, abasPorId],
  );
  const filtrados = useMemo(() => filtrarBanco(daAba, abasPorId, filtro), [daAba, abasPorId, filtro]);
  const resultado = useBusca(filtrados, busca, (l) => textoDeBusca(l, abasPorId.get(l.aba_id)), { manterOrdem: true, deps: [abasPorId] });
  const opcoesExtra = useMemo(() => (aba ? opcoesDeFiltro(daAba, aba) : []), [daAba, aba]);

  const idsMostrados = useMemo(() => new Set(resultado.itens.map((l) => l.id)), [resultado.itens]);
  const selecionadosMostrados = useMemo(() => leads.filter((l) => selecionados.has(l.id) && idsMostrados.has(l.id)), [leads, selecionados, idsMostrados]);

  const leadFicha = fichaId ? leads.find((l) => l.id === fichaId) ?? null : null;
  const crmLead = leadFicha?.lead_crm_id ? crm.leads.find((l) => l.id === leadFicha.lead_crm_id) ?? null : null;

  const aoEditar = (lead: LeadBanco, chave: string, valor: string) => {
    const abaDoLead = abasPorId.get(lead.aba_id);
    if (abaDoLead && chave === chaveDoPapel(abaDoLead, "primeira_msg")) {
      if (ehSim(valor)) void acoes.enviarAoCrm(lead);
      else if (lead.lead_crm_id) setSaida(lead);
      else void acoes.editar(lead, chave, valor);
      return;
    }
    void acoes.editar(lead, chave, valor);
  };

  const planilhaUrl = status?.planilha_id
    ? `https://docs.google.com/spreadsheets/d/${status.planilha_id}/edit${aba ? `#gid=${aba.id}` : ""}`
    : null;

  return (
    <div className={cn("flex flex-col gap-3", selecionadosMostrados.length > 0 && "pb-20")}>
      <SubAbas abas={abas} contagem={contagem} total={leads.filter((l) => abasPorId.has(l.aba_id)).length} atual={abaAtual} onEscolher={setAbaAtual} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar no Banco de leads"
            placeholder="Buscar nome, empresa, telefone ou qualquer dado"
            className="h-9 pl-9 md:text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <SeletorSimNao rotulo="Lead válido" valor={filtro.valido} onMudar={(v) => setFiltro((f) => ({ ...f, valido: v }))} opcoes={["Válidos e inválidos", "Só válidos", "Só inválidos"]} />
        <SeletorSimNao rotulo="No CRM" valor={filtro.crm} onMudar={(v) => setFiltro((f) => ({ ...f, crm: v }))} opcoes={["No CRM e fora", "Só no CRM", "Fora do CRM"]} />
        {aba && opcoesExtra.length > 0 && <MaisFiltros opcoes={opcoesExtra} valores={filtro.colunas} onMudar={(c) => setFiltro((f) => ({ ...f, colunas: c }))} />}
        {planilhaUrl && (
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <a href={planilhaUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir planilha</a>
          </Button>
        )}
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setNovoAberto(true)} disabled={!aba} title={aba ? `Novo lead em ${aba.nome}` : "Escolha uma aba para criar o lead nela"}>
          <Plus size={14} /> Lead
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusSync status={status} />
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {resultado.itens.length} {resultado.itens.length === 1 ? "lead" : "leads"}
        </span>
      </div>
      <MensagemBusca resultado={resultado} />

      {erro ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Não foi possível carregar o Banco de leads: {erro}
        </div>
      ) : carregando ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Carregando o Banco de leads…
        </div>
      ) : abas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma aba da planilha chegou ainda. Elas aparecem aqui assim que a planilha for conectada.
        </div>
      ) : (
        <BancoTabela
          aba={aba}
          abasPorId={abasPorId}
          leads={resultado.itens}
          selecionados={selecionados}
          onSelecionar={setSelecionados}
          onAbrir={setFichaId}
          onEditar={aoEditar}
        />
      )}

      <BancoFicha
        lead={leadFicha}
        aba={leadFicha ? abasPorId.get(leadFicha.aba_id) ?? null : null}
        crmLead={crmLead}
        crmColuna={crmLead ? crm.colunaDoLead(crmLead) ?? null : null}
        onFechar={() => setFichaId(null)}
        onEditar={aoEditar}
        onEnviarAoCrm={(l) => void acoes.enviarAoCrm(l)}
        onTirarDoCrm={(l) => setSaida(l)}
        onExcluir={(l) => {
          setFichaId(null);
          void acoes.excluir([l.id]);
        }}
        onAbrirNoCrm={(id) => {
          setFichaId(null);
          onAbrirNoCrm(id);
        }}
      />

      <BancoNovoLead aba={aba} aberto={novoAberto} onFechar={() => setNovoAberto(false)} onCriar={(d) => (aba ? acoes.criar(aba, d) : Promise.resolve(false))} />

      {selecionadosMostrados.length > 0 && (
        <BancoSelecaoBarra
          quantidade={selecionadosMostrados.length}
          onEnviarAoCrm={() => acoes.enviarEmMassa(selecionadosMostrados)}
          onValido={(v) => acoes.validoEmMassa(selecionadosMostrados, v)}
          onExcluir={() => acoes.excluir(selecionadosMostrados.map((l) => l.id))}
          onLimpar={() => setSelecionados(new Set())}
        />
      )}

      <AlertDialog open={!!saida} onOpenChange={(a) => { if (!a) setSaida(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar {saida ? nomeDoLead(saida, abasPorId.get(saida.aba_id)) : ""} do CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead e o histórico dele no CRM são apagados (reunião futura é cancelada na agenda). Na planilha, a linha do
              CRM vai para "CRM - lixeira" e "Primeira mensagem enviada" fica Não.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const l = saida;
                setSaida(null);
                if (l) void acoes.tirarDoCrm(l);
              }}
            >
              Tirar do CRM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
