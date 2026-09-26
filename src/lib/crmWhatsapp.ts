// Telefone do lead e link do WhatsApp (api.whatsapp.com, não wa.me). Sem dependências.

const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/** Número com código do país. Brasil pelo tamanho (10–11 dígitos ganham 55); "+" = internacional (8–15 dígitos). */
export function normalizarTelefone(t: string | null | undefined): string | null {
  const bruto = (t ?? "").trim();
  const d = digitos(bruto);
  if (bruto.startsWith("+")) return d.length >= 8 && d.length <= 15 ? d : null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export function problemaTelefone(t: string | null | undefined): string | null {
  if (!digitos(t)) return "Sem telefone cadastrado";
  return normalizarTelefone(t) ? null : "Telefone incompleto no cadastro";
}

export function linkWhatsapp(t: string | null | undefined, texto?: string): string | null {
  const n = normalizarTelefone(t);
  if (!n) return null;
  return `https://api.whatsapp.com/send?phone=${n}${texto ? `&text=${encodeURIComponent(texto)}` : ""}`;
}

export function formatarTelefone(t: string | null | undefined): string {
  const bruto = (t ?? "").trim();
  if (bruto.startsWith("+")) return bruto;
  const d = digitos(bruto);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto;
}
