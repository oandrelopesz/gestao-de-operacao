import { File, FileArchive, FileSpreadsheet, FileText, FileType, Presentation, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { extensaoDe, tipoDoArquivo, type TipoArquivo } from "@/lib/pdfsArvore";

const VISUAL: Record<TipoArquivo, { Icone: LucideIcon; cor: string }> = {
  pdf: { Icone: FileText, cor: "bg-red-500/10 text-red-500" },
  texto: { Icone: FileType, cor: "bg-slate-500/10 text-slate-500 dark:text-slate-300" },
  planilha: { Icone: FileSpreadsheet, cor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  apresentacao: { Icone: Presentation, cor: "bg-orange-500/10 text-orange-500" },
  documento: { Icone: FileText, cor: "bg-blue-500/10 text-blue-500" },
  compactado: { Icone: FileArchive, cor: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  outro: { Icone: File, cor: "bg-muted text-muted-foreground" },
};

/** Ícone colorido pelo tipo do arquivo (a extensão aparece embaixo, em miniatura). */
export function IconeArquivo({ nome, tamanho = 36, className }: { nome: string; tamanho?: number; className?: string }) {
  const { Icone, cor } = VISUAL[tipoDoArquivo(nome)];
  const ext = extensaoDe(nome);
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center rounded-lg", cor, className)} style={{ width: tamanho, height: tamanho }}>
      <Icone size={Math.round(tamanho / 2)} />
      {ext && tamanho >= 32 && (
        <span className="absolute -bottom-1 rounded bg-background px-0.5 text-[8px] font-bold uppercase leading-tight tracking-tight shadow-sm ring-1 ring-border">
          {ext.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

/** Só o desenho do ícone (para lugares pequenos, como a lista de envio). */
export function IconeArquivoSimples({ nome, size = 14 }: { nome: string; size?: number }) {
  const { Icone, cor } = VISUAL[tipoDoArquivo(nome)];
  return <Icone size={size} className={cn("shrink-0 bg-transparent", cor.split(" ").filter((c) => c.startsWith("text-") || c.startsWith("dark:text-")).join(" "))} />;
}
