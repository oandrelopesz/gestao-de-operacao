// Aba "Contexto" da gaveta do perfil: contexto completo do cliente para os posts, extração dos dados estruturados
// (briefing) e marcação de saúde. Os rascunhos ficam na gaveta; aqui só se mostra e se edita.
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClienteOpcao, PerfilGmn } from "@/lib/gmn";
import { LIMITE_CONTEXTO_POSTS, type Briefing } from "../../../supabase/functions/gmn/regras.ts";
import { BriefingForm } from "./BriefingForm";

const SEM_CLIENTE = "__sem__";
const AVISO = "text-xs font-medium text-amber-600 dark:text-amber-400";

export function AbaContexto({
  perfil, dados, briefing, clientes, alterado, salvando, extraindo, dadosAbertos,
  onDados, onBriefing, onDadosAbertos, onExtrair, onGerarIa, onSalvar,
}: {
  /** O perfil como está salvo (só para a data do último salvamento). */
  perfil: PerfilGmn;
  dados: PerfilGmn;
  briefing: Briefing;
  clientes: ClienteOpcao[];
  alterado: boolean;
  salvando: boolean;
  extraindo: boolean;
  dadosAbertos: boolean;
  onDados: (patch: Partial<PerfilGmn>) => void;
  onBriefing: (b: Briefing) => void;
  onDadosAbertos: (aberto: boolean) => void;
  onExtrair: () => void;
  onGerarIa: () => void;
  onSalvar: () => void;
}) {
  const contexto = dados.contexto_posts ?? "";
  const temContexto = contexto.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gmn-cliente">Cliente do sistema (opcional)</Label>
        <Select value={dados.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => onDados({ cliente_id: v === SEM_CLIENTE ? null : v })}>
          <SelectTrigger id="gmn-cliente" aria-label="Cliente do sistema (opcional)"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
            {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={dados.saude} onCheckedChange={(v) => onDados({ saude: v === true })} />
        Perfil da área da saúde (aplica as regras do CFM/CFO)
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="gmn-contexto-posts">Contexto para os posts</Label>
        <Textarea
          id="gmn-contexto-posts"
          rows={14}
          value={contexto}
          aria-describedby="gmn-contexto-posts-dica"
          onChange={(e) => onDados({ contexto_posts: e.target.value })}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p id="gmn-contexto-posts-dica" className="text-xs text-muted-foreground">
            Cole aqui o contexto completo do cliente gerado pelo prompt de contexto (objetivo, SEO local, tom de voz e guardrails).
          </p>
          <p className="text-xs text-muted-foreground">{contexto.length.toLocaleString("pt-BR")} caracteres</p>
        </div>
        {contexto.length > LIMITE_CONTEXTO_POSTS && (
          <p className={AVISO}>
            Só os primeiros {LIMITE_CONTEXTO_POSTS.toLocaleString("pt-BR")} caracteres entram nos posts e na extração.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={onExtrair} disabled={!temContexto || extraindo}>
          {extraindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {extraindo ? "Extraindo…" : "Extrair do contexto"}
        </Button>
        {extraindo ? (
          <span role="status" className="text-xs text-muted-foreground">Lendo o contexto e preenchendo os dados extraídos…</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Preenche os dados extraídos abaixo a partir do texto da tela; nada é salvo até você clicar em Salvar contexto.
          </span>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left text-sm font-medium"
          aria-expanded={dadosAbertos}
          aria-controls="gmn-dados-extraidos"
          onClick={() => onDadosAbertos(!dadosAbertos)}
        >
          {dadosAbertos ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
          Dados extraídos (usados na checagem e no rodízio de palavras-chave)
        </button>
        {/* Sempre montado (só escondido): assim o aria-controls do botão aponta para um elemento que existe. */}
        <div id="gmn-dados-extraidos" hidden={!dadosAbertos} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onGerarIa} disabled={extraindo}>
              <Sparkles className="mr-2 h-4 w-4" />Gerar com IA
            </Button>
            <span className="text-xs text-muted-foreground">
              Opcional: monta um rascunho a partir de um briefing de Dados internos e do que está salvo.
            </span>
          </div>
          {/* Durante a extração o formulário fica travado: o resultado substitui os campos. */}
          <fieldset disabled={extraindo} className="min-w-0 border-0 p-0">
            <BriefingForm valor={briefing} onChange={onBriefing} />
          </fieldset>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSalvar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar contexto
        </Button>
        {alterado && <span className={AVISO}>Alterações não salvas</span>}
      </div>
      {alterado && (
        <p className="text-xs text-muted-foreground">
          Há alterações não salvas: a prévia e o botão Gerar com IA usam o que está salvo (cliente, saúde, contexto e dados extraídos).
        </p>
      )}
      {perfil.briefing_salvo_em && (
        <p className="text-xs text-muted-foreground">Salvo em {new Date(perfil.briefing_salvo_em).toLocaleString("pt-BR")}.</p>
      )}
    </div>
  );
}
