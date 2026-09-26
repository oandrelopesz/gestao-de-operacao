// Estado e ações do CRM compartilhados pelas visões (Kanban, Fila, Planilha, Dashboard), ficha e janelas.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import type { ColunaCrm, EventoCrm, LeadCrm, NovoEvento, Trafego } from "@/lib/crmTipos";
import { colunaInicial, emMassa, exigenciaDe, ordenarColunas, type Exigencia } from "@/lib/crmColunas";
import {
  planejarMovimento, planejarReuniao, validarMovimento, validarReuniao, type DadosJanela, type DadosReuniao, type PlanoMovimento,
} from "@/lib/crmMovimento";
import { registrarTentativa as planejarTentativa } from "@/lib/crmTentativas";
import { marcarPonto as planejarPonto, NOMES_PONTOS } from "@/lib/crmPontos";
import { acaoPendente } from "@/lib/crmAgenda";
import type { EscopoExport } from "@/lib/crmExport";
import * as dados from "@/lib/crmDados";
import { useCachedState } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";

export interface MovimentoPendente {
  lead: LeadCrm;
  destino: ColunaCrm;
  exigencia: Exigencia;
  aoCancelar?: () => void;
}

export interface CrmValor {
  colunas: ColunaCrm[];
  leads: LeadCrm[];
  eventos: EventoCrm[];
  carregando: boolean;
  erro: string | null;
  setLeads: Dispatch<SetStateAction<LeadCrm[]>>;
  recarregar: () => Promise<void>;
  /** Coluna do lead (sem coluna = a inicial) */
  colunaDoLead: (lead: LeadCrm) => ColunaCrm;
  /** Move na hora ou abre a janela da exigência; `aoCancelar` desfaz o arrasto */
  pedirMovimento: (lead: LeadCrm, destinoId: string, opts?: { aoCancelar?: () => void }) => void;
  movimentoPendente: MovimentoPendente | null;
  /** null = cancelar. Devolve false se a validação recusou (janela continua aberta). */
  resolverMovimento: (dadosJanela: DadosJanela | null) => Promise<boolean>;
  moverLead: (lead: LeadCrm, destinoId: string, dadosJanela: DadosJanela) => Promise<boolean>;
  registrarTentativa: (lead: LeadCrm) => Promise<void>;
  marcarPonto: (lead: LeadCrm, n: number, feito: boolean) => Promise<void>;
  /** Edição de campos da ficha; `rotulo` vai para o histórico */
  salvarCampos: (lead: LeadCrm, patch: Partial<LeadCrm>, rotulo?: string) => Promise<void>;
  alterarReuniao: (lead: LeadCrm, r: DadosReuniao) => Promise<boolean>;
  tentarAgendaDeNovo: (lead: LeadCrm) => Promise<void>;
  adicionarNota: (lead: LeadCrm, texto: string) => Promise<void>;
  criarLead: (dadosLead: Partial<LeadCrm>) => Promise<LeadCrm | null>;
  excluirLeads: (ids: string[]) => Promise<void>;
  moverEmMassa: (ids: string[], destinoId: string, motivo?: string) => Promise<void>;
  trafegoEmMassa: (ids: string[], trafego: Trafego) => Promise<void>;
  salvarColunas: (colunas: ColunaCrm[], remocoes: { id: string; destinoId: string }[]) => Promise<boolean>;
  salvarOrdem: (itens: { id: string; ordem: number }[]) => Promise<void>;
  fichaId: string | null;
  abrirFicha: (id: string | null) => void;
  cadastroCliente: LeadCrm | null;
  iniciarCadastroCliente: (lead: LeadCrm | null) => void;
  /** Grava cliente_id no lead e o evento no histórico; false se não conseguiu vincular */
  concluirCadastroCliente: (lead: LeadCrm, clienteId: string) => Promise<boolean>;
  /** Janela de exportação aberta com este recorte (null = fechada) */
  exportacao: EscopoExport | null;
  abrirExportacao: (escopo: EscopoExport | null) => void;
}

const Ctx = createContext<CrmValor | null>(null);

export function useCrm(): CrmValor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCrm usado fora do CrmProvider");
  return v;
}

const vazio = (plano: Partial<PlanoMovimento>): PlanoMovimento => ({ patch: {}, eventos: [], agenda: null, ...plano });

export function CrmProvider({ children }: { children: ReactNode }) {
  const [colunasBrutas, setColunas] = useCachedState<ColunaCrm[]>(CACHE_KEYS.crmColunas, []);
  const [leads, setLeads] = useCachedState<LeadCrm[]>(CACHE_KEYS.crmLeads, []);
  const [eventos, setEventos] = useCachedState<EventoCrm[]>(CACHE_KEYS.crmEventos, []);
  const [carregando, setCarregando] = useState(colunasBrutas.length === 0);
  const [erro, setErro] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [movimentoPendente, setMovimentoPendente] = useState<MovimentoPendente | null>(null);
  const [cadastroCliente, setCadastroCliente] = useState<LeadCrm | null>(null);
  const [exportacao, setExportacao] = useState<EscopoExport | null>(null);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  const recarregar = useCallback(async () => {
    try {
      const [c, l, e] = await Promise.all([dados.carregarColunas(), dados.carregarLeads(), dados.carregarEventos()]);
      setColunas(c);
      setLeads(l);
      setEventos(e);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }, [setColunas, setLeads, setEventos]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const colunas = useMemo(() => ordenarColunas(colunasBrutas), [colunasBrutas]);
  const colunaDoLead = useCallback(
    (l: LeadCrm): ColunaCrm => colunas.find((c) => c.id === l.coluna_id) ?? colunaInicial(colunas) ?? colunas[0],
    [colunas],
  );

  const trocarLead = useCallback((l: LeadCrm) => setLeads((prev) => prev.map((x) => (x.id === l.id ? l : x))), [setLeads]);
  const juntarEventos = useCallback((novos: EventoCrm[]) => setEventos((prev) => [...novos, ...prev]), [setEventos]);

  /** Aplica o plano com atualização otimista; `base` é o estado de antes (para desfazer se falhar). */
  const executarPlano = useCallback(
    async (base: LeadCrm, plano: PlanoMovimento): Promise<LeadCrm | null> => {
      trocarLead({ ...base, ...plano.patch } as LeadCrm);
      try {
        const r = await dados.aplicarPlano(base, plano);
        trocarLead(r.lead);
        juntarEventos(r.eventos);
        if (plano.agenda && r.lead.evento_status === "erro") {
          toast.error(`Agenda: ${r.lead.evento_erro ?? "falhou"}. O lead foi salvo mesmo assim.`);
        }
        return r.lead;
      } catch (e: any) {
        trocarLead(base);
        toast.error("Não foi possível salvar: " + (e?.message ?? String(e)));
        return null;
      }
    },
    [trocarLead, juntarEventos],
  );

  const moverLead = useCallback(
    async (lead: LeadCrm, destinoId: string, dadosJanela: DadosJanela) => {
      const destino = colunas.find((c) => c.id === destinoId);
      if (!destino) return false;
      const origem = colunaDoLead(lead);
      if (origem.id === destino.id) return true;
      const erroV = validarMovimento(lead, destino, dadosJanela);
      if (erroV) {
        toast.error(erroV);
        return false;
      }
      const r = await executarPlano(lead, planejarMovimento(lead, origem, destino, dadosJanela, new Date()));
      if (r && destino.tipo === "ganho" && !r.cliente_id) {
        toast.success("Lead fechado!", { action: { label: "Cadastrar como cliente", onClick: () => setCadastroCliente(r) } });
      }
      return !!r;
    },
    [colunas, colunaDoLead, executarPlano],
  );

  const pedirMovimento = useCallback(
    (lead: LeadCrm, destinoId: string, opts?: { aoCancelar?: () => void }) => {
      const destino = colunas.find((c) => c.id === destinoId);
      if (!destino || destino.id === colunaDoLead(lead).id) {
        opts?.aoCancelar?.();
        return;
      }
      const exigencia = exigenciaDe(destino.tipo, lead);
      if (exigencia === "nenhuma") {
        void moverLead(lead, destinoId, {}).then((ok) => {
          if (!ok) opts?.aoCancelar?.();
        });
        return;
      }
      setMovimentoPendente({ lead, destino, exigencia, aoCancelar: opts?.aoCancelar });
    },
    [colunas, colunaDoLead, moverLead],
  );

  const resolverMovimento = useCallback(
    async (dadosJanela: DadosJanela | null) => {
      const p = movimentoPendente;
      if (!p) return true;
      if (!dadosJanela) {
        setMovimentoPendente(null);
        p.aoCancelar?.();
        return true;
      }
      const erroV = validarMovimento(p.lead, p.destino, dadosJanela);
      if (erroV) {
        toast.error(erroV);
        return false;
      }
      setMovimentoPendente(null);
      const ok = await moverLead(p.lead, p.destino.id, dadosJanela);
      if (!ok) p.aoCancelar?.();
      return true;
    },
    [movimentoPendente, moverLead],
  );

  const registrarTentativa = useCallback(
    async (lead: LeadCrm) => {
      const r = planejarTentativa(lead, colunaDoLead(lead), new Date());
      if (typeof r === "string") {
        toast.error(r);
        return;
      }
      await executarPlano(lead, vazio({ patch: r.patch, eventos: r.eventos }));
    },
    [colunaDoLead, executarPlano],
  );

  const marcarPonto = useCallback(
    async (lead: LeadCrm, n: number, feito: boolean) => {
      if (!lead.reuniao_em) return;
      const estado = planejarPonto(lead, n, feito, new Date());
      const evento: NovoEvento = {
        tipo: "ponto_contato",
        descricao: `${feito ? "Ponto de contato feito" : "Ponto de contato desmarcado"}: ${NOMES_PONTOS[n - 1]}`,
        dados: { n, feito },
      };
      await executarPlano(lead, vazio({ patch: { pontos_contato: estado }, eventos: [evento] }));
    },
    [executarPlano],
  );

  const salvarCampos = useCallback(
    async (lead: LeadCrm, patch: Partial<LeadCrm>, rotulo?: string) => {
      const mudou = Object.fromEntries(
        Object.entries(patch).filter(([k, v]) => (lead as any)[k] !== v),
      ) as Partial<LeadCrm>;
      if (!Object.keys(mudou).length) return;
      const reuniaoFutura = !!lead.reuniao_em && new Date(lead.reuniao_em).getTime() > Date.now();
      const agenda = "email" in mudou && lead.evento_google_id && reuniaoFutura ? "convidar" : null;
      const evento: NovoEvento = { tipo: "edicao", descricao: rotulo ?? `Dados editados: ${Object.keys(mudou).join(", ")}`, dados: { campos: Object.keys(mudou) } };
      await executarPlano(lead, vazio({ patch: mudou, eventos: [evento], agenda }));
    },
    [executarPlano],
  );

  const alterarReuniao = useCallback(
    async (lead: LeadCrm, r: DadosReuniao) => {
      const erroV = validarReuniao(r);
      if (erroV) {
        toast.error(erroV);
        return false;
      }
      return !!(await executarPlano(lead, planejarReuniao(lead, r, new Date())));
    },
    [executarPlano],
  );

  const tentarAgendaDeNovo = useCallback(
    async (lead: LeadCrm) => {
      const acao = acaoPendente(lead, colunaDoLead(lead).tipo);
      if (!acao) {
        toast.info("Nada pendente na agenda para este lead.");
        return;
      }
      const r = await executarPlano(lead, vazio({ agenda: acao }));
      if (r?.evento_status === "ok") toast.success("Agenda atualizada.");
    },
    [colunaDoLead, executarPlano],
  );

  const adicionarNota = useCallback(
    async (lead: LeadCrm, texto: string) => {
      const t = texto.trim();
      if (!t) return;
      try {
        juntarEventos(await dados.gravarEventos(lead.id, [{ tipo: "nota", descricao: t }]));
      } catch (e: any) {
        toast.error("Não foi possível salvar a nota: " + (e?.message ?? e));
      }
    },
    [juntarEventos],
  );

  const criarLead = useCallback(
    async (dadosLead: Partial<LeadCrm>) => {
      const inicial = colunaInicial(colunas);
      if (!inicial) {
        toast.error("Crie uma coluna antes de cadastrar leads.");
        return null;
      }
      try {
        const r = await dados.criarLead(dadosLead, inicial);
        setLeads((prev) => [r.lead, ...prev]);
        juntarEventos(r.eventos);
        return r.lead;
      } catch (e: any) {
        toast.error("Não foi possível cadastrar: " + (e?.message ?? e));
        return null;
      }
    },
    [colunas, setLeads, juntarEventos],
  );

  const excluirLeads = useCallback(
    async (ids: string[]) => {
      try {
        // Reunião futura de lead excluído: cancela o evento na agenda (nunca lança; falha só fica no console)
        const agora = Date.now();
        for (const id of ids) {
          const l = leadsRef.current.find((x) => x.id === id);
          if (l?.evento_google_id && l.reuniao_em && new Date(l.reuniao_em).getTime() > agora) {
            const r = await dados.executarAgenda(l, l, "cancelar");
            if (r.patch.evento_status === "erro") console.warn("Evento não cancelado:", r.patch.evento_erro);
          }
        }
        await dados.excluirLeads(ids);
        const fora = new Set(ids);
        setLeads((prev) => prev.filter((l) => !fora.has(l.id)));
        setEventos((prev) => prev.filter((e) => !fora.has(e.lead_id)));
        if (fichaId && fora.has(fichaId)) setFichaId(null);
        toast.success(ids.length === 1 ? "Lead excluído." : `${ids.length} leads excluídos.`);
      } catch (e: any) {
        toast.error("Não foi possível excluir: " + (e?.message ?? e));
      }
    },
    [setLeads, setEventos, fichaId],
  );

  const moverEmMassa = useCallback(
    async (ids: string[], destinoId: string, motivo?: string) => {
      const destino = colunas.find((c) => c.id === destinoId);
      if (!destino) return;
      const modo = emMassa(destino.tipo);
      if (modo === "nao") {
        toast.error(`"${destino.titulo}" pede um dado por lead: mova um de cada vez.`);
        return;
      }
      if (modo === "motivo" && !motivo?.trim()) {
        toast.error("Escolha o motivo.");
        return;
      }
      let movidos = 0;
      for (const id of ids) {
        const lead = leadsRef.current.find((l) => l.id === id);
        if (!lead || colunaDoLead(lead).id === destino.id) continue;
        const plano = planejarMovimento(lead, colunaDoLead(lead), destino, modo === "motivo" ? { motivo } : {}, new Date());
        plano.eventos.push({ tipo: "em_massa", descricao: `Movido em massa (${ids.length} leads)`, dados: { destino: destino.id } });
        if (await executarPlano(lead, plano)) movidos++;
      }
      toast.success(`${movidos} ${movidos === 1 ? "lead movido" : "leads movidos"} para ${destino.titulo}.`);
    },
    [colunas, colunaDoLead, executarPlano],
  );

  const trafegoEmMassa = useCallback(
    async (ids: string[], trafego: Trafego) => {
      for (const id of ids) {
        const lead = leadsRef.current.find((l) => l.id === id);
        if (!lead || lead.trafego === trafego) continue;
        await executarPlano(lead, vazio({
          patch: { trafego },
          eventos: [{ tipo: "em_massa", descricao: `Etiqueta alterada em massa para ${trafego === "pago" ? "Pago" : "Orgânico"}`, dados: { trafego } }],
        }));
      }
      toast.success("Etiqueta atualizada.");
    },
    [executarPlano],
  );

  const salvarColunas = useCallback(
    async (novas: ColunaCrm[], remocoes: { id: string; destinoId: string }[]) => {
      try {
        await dados.salvarColunas(novas, remocoes);
        await recarregar();
        toast.success("Colunas salvas.");
        return true;
      } catch (e: any) {
        toast.error("Não foi possível salvar as colunas: " + (e?.message ?? e));
        return false;
      }
    },
    [recarregar],
  );

  const salvarOrdem = useCallback(async (itens: { id: string; ordem: number }[]) => {
    try {
      await dados.salvarOrdem(itens);
    } catch {
      // ordem é cosmética: a próxima carga corrige
    }
  }, []);

  const concluirCadastroCliente = useCallback(
    async (lead: LeadCrm, clienteId: string) => {
      return !!await executarPlano(lead, vazio({
        patch: { cliente_id: clienteId },
        eventos: [{ tipo: "cliente_cadastrado", descricao: "Cadastrado como cliente ativo", dados: { cliente_id: clienteId } }],
      }));
    },
    [executarPlano],
  );

  const valor: CrmValor = {
    colunas, leads, eventos, carregando, erro, setLeads, recarregar, colunaDoLead, pedirMovimento, movimentoPendente,
    resolverMovimento, moverLead, registrarTentativa, marcarPonto, salvarCampos, alterarReuniao, tentarAgendaDeNovo,
    adicionarNota, criarLead, excluirLeads, moverEmMassa, trafegoEmMassa, salvarColunas, salvarOrdem,
    fichaId, abrirFicha: setFichaId, cadastroCliente, iniciarCadastroCliente: setCadastroCliente, concluirCadastroCliente,
    exportacao, abrirExportacao: setExportacao,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
