import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CLASSES,
  CONFIANCAS,
  FILTROS_VAZIOS,
  STATUS,
  TEMAS,
  TIPOS,
  contarFiltros,
  type Classe,
  type Filtros,
  type TipoAchado,
} from "@/lib/radar";

const CLASSES_ORDEM: Classe[] = ["excelente", "bom", "medio"];
const TIPOS_ORDEM: TipoAchado[] = ["A", "B", "C"];

type Patch = Partial<Filtros>;
type Mudar = (patch: Patch) => void;

type Chip = { id: string; texto: string; patch: Patch };

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

function dataBr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function chipsDeLista<T extends string>(
  chave: keyof Filtros,
  lista: T[],
  rotulo: (v: T) => string,
): Chip[] {
  return lista.map((v) => ({
    id: `${String(chave)}-${v}`,
    texto: rotulo(v),
    patch: { [chave]: lista.filter((x) => x !== v) } as Patch,
  }));
}

function chipsDe(f: Filtros): Chip[] {
  return [
    ...chipsDeLista("classe", f.classe, (c) => `Classe: ${CLASSES[c].emoji} ${CLASSES[c].rotulo}`),
    ...chipsDeLista(
      "tema",
      f.tema,
      (s) => `Tema: ${TEMAS.find((t) => t.slug === s)?.rotulo ?? s}`,
    ),
    ...chipsDeLista("tipo", f.tipo, (t) => `Tipo: ${TIPOS[t]}`),
    ...chipsDeLista(
      "status",
      f.status,
      (s) => `Status: ${STATUS.find((x) => x.valor === s)?.rotulo ?? s}`,
    ),
    ...chipsDeLista(
      "confianca",
      f.confianca,
      (c) => `Confiança: ${CONFIANCAS.find((x) => x.valor === c)?.rotulo ?? c}`,
    ),
    ...(f.alerta ? [{ id: "alerta", texto: "Só alertas", patch: { alerta: false } }] : []),
    ...(f.de ? [{ id: "de", texto: `De: ${dataBr(f.de)}`, patch: { de: undefined } }] : []),
    ...(f.ate ? [{ id: "ate", texto: `Até: ${dataBr(f.ate)}`, patch: { ate: undefined } }] : []),
    ...(f.q ? [{ id: "q", texto: `Busca: ${f.q}`, patch: { q: "" } }] : []),
  ];
}

function GrupoChecks<T extends string>({
  titulo,
  opcoes,
  selecionados,
  onAlternar,
}: {
  titulo: string;
  opcoes: { valor: T; rotulo: string }[];
  selecionados: T[];
  onAlternar: (valor: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{titulo}</legend>
      {opcoes.map((o) => (
        <label
          key={o.valor}
          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm lg:min-h-0"
        >
          <Checkbox
            checked={selecionados.includes(o.valor)}
            onCheckedChange={() => onAlternar(o.valor)}
          />
          {o.rotulo}
        </label>
      ))}
    </fieldset>
  );
}

// Mesmos controles no desktop (linha) e no Sheet do celular (coluna).
function Controles({
  filtros,
  mudar,
  variante,
}: {
  filtros: Filtros;
  mudar: Mudar;
  variante: "linha" | "coluna";
}) {
  const botaoClasse = CLASSES_ORDEM.map((c) => {
    const ativo = filtros.classe.includes(c);
    return (
      <Button
        key={c}
        type="button"
        size="sm"
        variant={ativo ? "default" : "outline"}
        aria-pressed={ativo}
        className="min-h-11 lg:min-h-0"
        onClick={() => mudar({ classe: alternar(filtros.classe, c) })}
      >
        {CLASSES[c].emoji} {CLASSES[c].rotulo}
      </Button>
    );
  });

  const alerta = (
    <Button
      type="button"
      size="sm"
      variant={filtros.alerta ? "default" : "outline"}
      aria-pressed={filtros.alerta}
      className="min-h-11 lg:min-h-0"
      onClick={() => mudar({ alerta: !filtros.alerta })}
    >
      🚨 Só alertas
    </Button>
  );

  const periodo = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">De</span>
      <Input
        type="date"
        aria-label="Período de"
        value={filtros.de ?? ""}
        onChange={(e) => mudar({ de: e.target.value || undefined, dia: undefined })}
        className="h-11 w-auto lg:h-8"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <Input
        type="date"
        aria-label="Período até"
        value={filtros.ate ?? ""}
        onChange={(e) => mudar({ ate: e.target.value || undefined, dia: undefined })}
        className="h-11 w-auto lg:h-8"
      />
    </div>
  );

  const grupos = (
    <>
      <GrupoChecks
        titulo="Temas"
        opcoes={TEMAS.map((t) => ({ valor: t.slug, rotulo: t.rotulo }))}
        selecionados={filtros.tema}
        onAlternar={(v) => mudar({ tema: alternar(filtros.tema, v) })}
      />
      <GrupoChecks
        titulo="Tipo"
        opcoes={TIPOS_ORDEM.map((t) => ({ valor: t, rotulo: `${t} · ${TIPOS[t]}` }))}
        selecionados={filtros.tipo}
        onAlternar={(v) => mudar({ tipo: alternar(filtros.tipo, v) })}
      />
      <GrupoChecks
        titulo="Status"
        opcoes={STATUS}
        selecionados={filtros.status}
        onAlternar={(v) => mudar({ status: alternar(filtros.status, v) })}
      />
      <GrupoChecks
        titulo="Confiança"
        opcoes={CONFIANCAS}
        selecionados={filtros.confianca}
        onAlternar={(v) => mudar({ confianca: alternar(filtros.confianca, v) })}
      />
    </>
  );

  if (variante === "coluna") {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Classe</p>
          <div className="flex flex-wrap gap-2">
            {botaoClasse}
            {alerta}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Período</p>
          {periodo}
        </div>
        {grupos}
      </div>
    );
  }

  const maisAtivos =
    filtros.tema.length + filtros.tipo.length + filtros.status.length + filtros.confianca.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {botaoClasse}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:min-h-0">
            Mais filtros{maisAtivos > 0 ? ` (${maisAtivos})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70vh] w-72 space-y-4 overflow-y-auto">
          {grupos}
        </PopoverContent>
      </Popover>
      {alerta}
      {periodo}
    </div>
  );
}

export function BarraFiltros({
  filtros,
  onChange,
}: {
  filtros: Filtros;
  onChange: (f: Filtros, opcoes?: { substituir?: boolean }) => void;
}) {
  const [texto, setTexto] = useState(filtros.q);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const ultimo = useRef({ filtros, onChange });

  // Busca vinda de fora (URL, chip, limpar) sobrescreve o texto, sem atrapalhar a digitação.
  useEffect(() => {
    setTexto((atual) => (atual.trim() === filtros.q ? atual : filtros.q));
  }, [filtros.q]);

  useEffect(() => {
    ultimo.current = { filtros, onChange };
  });

  // Debounce de 300 ms: só emite quando o texto difere do que já está nos filtros.
  useEffect(() => {
    const t = setTimeout(() => {
      const { filtros: atual, onChange: emitir } = ultimo.current;
      const q = texto.trim();
      if (q !== atual.q) emitir({ ...atual, q }, { substituir: true });
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const mudar: Mudar = (patch) => {
    if (patch.q !== undefined) setTexto(patch.q);
    onChange({ ...filtros, ...patch });
  };

  const limparTudo = () => {
    setTexto("");
    onChange({ ...FILTROS_VAZIOS, dia: filtros.dia, view: filtros.view });
  };

  const chips = chipsDe(filtros);
  const contagem = contarFiltros(filtros);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar achados"
            placeholder="Buscar título ou texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="h-11 pl-9 lg:h-9"
          />
        </div>

        <div className="hidden lg:block">
          <Controles filtros={filtros} mudar={mudar} variante="linha" />
        </div>

        <div className="w-full lg:hidden">
          <Sheet open={gavetaAberta} onOpenChange={setGavetaAberta}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="min-h-11 w-full">
                <SlidersHorizontal aria-hidden />
                Filtros ({contagem})
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription>Escolha os filtros do Radar.</SheetDescription>
              </SheetHeader>
              <Controles filtros={filtros} mudar={mudar} variante="coluna" />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Remover filtro ${c.texto}`}
              onClick={() => mudar(c.patch)}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-secondary px-3 text-xs font-medium hover:bg-secondary/70 lg:min-h-7"
            >
              {c.texto}
              <X aria-hidden className="size-3.5" />
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" className="min-h-11 lg:min-h-0" onClick={limparTudo}>
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}
