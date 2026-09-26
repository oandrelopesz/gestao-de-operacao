// Barra inferior do celular (< lg): os atalhos mais usados; o resto fica no menu "Mais".
// Sem dependências: roda no navegador e no `node --test`.

export interface AtalhoMobile {
  to: string;
  rotulo: string;
}

export const ATALHOS_MOBILE: AtalhoMobile[] = [
  { to: "/", rotulo: "Demandas" },
  { to: "/agenda", rotulo: "Agenda" },
  { to: "/notas", rotulo: "Notas" },
  { to: "/transcritor", rotulo: "Transcritor" },
];

/** Demandas ("/") só acende na raiz; os demais também nas subrotas ("/notas/123"). */
export function atalhoAtivo(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
