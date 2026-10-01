// Campos do briefing do perfil. Listas são editadas uma por linha.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Briefing } from "../../../supabase/functions/gmn/regras.ts";

type CampoTexto = "contexto" | "objetivo" | "posicionamento" | "publico" | "tom_de_voz" | "cidade";
type CampoLista = "servicos" | "bairros" | "palavras_chave" | "diferenciais" | "termos_proibidos";

const TEXTOS: { campo: CampoTexto; rotulo: string; dica: string; linhas: number }[] = [
  { campo: "contexto", rotulo: "Contexto", dica: "Quem é o negócio ou o especialista e sua história.", linhas: 3 },
  { campo: "objetivo", rotulo: "Objetivo dos posts", dica: "Agendamentos, ligações, visitas, autoridade…", linhas: 2 },
  { campo: "posicionamento", rotulo: "Posicionamento", dica: "Como a marca quer ser vista.", linhas: 2 },
  { campo: "publico", rotulo: "Público-alvo", dica: "", linhas: 2 },
  { campo: "tom_de_voz", rotulo: "Tom de voz", dica: "Ex.: próximo e confiável, sem gírias.", linhas: 2 },
];

const LISTAS: { campo: CampoLista; rotulo: string; dica: string }[] = [
  { campo: "servicos", rotulo: "Serviços ou produtos em destaque", dica: "Um por linha." },
  { campo: "bairros", rotulo: "Bairros ou região atendida", dica: "Um por linha." },
  { campo: "palavras_chave", rotulo: "Palavras-chave de SEO local", dica: "Uma por linha, como o cliente buscaria." },
  { campo: "diferenciais", rotulo: "Diferenciais", dica: "Um por linha." },
  { campo: "termos_proibidos", rotulo: "Termos proibidos", dica: "O post que tiver algum destes não é publicado." },
];

export function BriefingForm({ valor, onChange }: { valor: Briefing; onChange: (b: Briefing) => void }) {
  return (
    <div className="space-y-4">
      {TEXTOS.map((t) => (
        <div key={t.campo} className="space-y-1.5">
          <Label htmlFor={`gmn-${t.campo}`}>{t.rotulo}</Label>
          <Textarea
            id={`gmn-${t.campo}`}
            rows={t.linhas}
            value={valor[t.campo]}
            onChange={(e) => onChange({ ...valor, [t.campo]: e.target.value })}
          />
          {t.dica && <p className="text-xs text-muted-foreground">{t.dica}</p>}
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="gmn-cidade">Cidade</Label>
        <Input id="gmn-cidade" value={valor.cidade} onChange={(e) => onChange({ ...valor, cidade: e.target.value })} />
      </div>
      {LISTAS.map((l) => (
        <div key={l.campo} className="space-y-1.5">
          <Label htmlFor={`gmn-${l.campo}`}>{l.rotulo}</Label>
          <Textarea
            id={`gmn-${l.campo}`}
            rows={4}
            value={valor[l.campo].join("\n")}
            onChange={(e) => onChange({ ...valor, [l.campo]: e.target.value.split("\n") })}
          />
          <p className="text-xs text-muted-foreground">{l.dica}</p>
        </div>
      ))}
    </div>
  );
}
