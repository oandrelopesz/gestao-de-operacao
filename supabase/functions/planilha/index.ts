// Ponte entre a "Planilha CRM Mestra" (Apps Script) e o sistema (spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md).
//   POST { acao, planilha_id, ... } com o cabeçalho x-planilha-chave. Ações em acoes.ts.
//   acao "registrar" { chave }: grava a chave na primeira vez (a linha de planilha_config já precisa existir).
// Sem CORS: só o Apps Script chama (servidor para servidor). verify_jwt = false em supabase/config.toml.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { ACOES } from "./acoes.ts";
import * as D from "./dados.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, servico: "planilha" });
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { headers: { "x-origem": "planilha" } },
    auth: { persistSession: false },
  });
  const acao = String(corpo?.acao ?? "");
  const chave = req.headers.get("x-planilha-chave") ?? "";
  try {
    const cfg = await D.config(sb);
    if (!cfg) return json({ erro: "Planilha não configurada no sistema." }, 409);
    if (String(corpo.planilha_id ?? "") !== cfg.planilha_id) return json({ erro: "Esta planilha não é a configurada no sistema." }, 403);

    if (acao === "registrar") {
      const nova = String(corpo.chave ?? "");
      if (!cfg.chave) {
        if (nova.length < 32) return json({ erro: "Chave curta demais." }, 400);
        const { error } = await sb.from("planilha_config").update({ chave: nova, updated_at: new Date().toISOString() }).eq("id", "principal");
        if (error) throw new Error(error.message);
        return json({ ok: true, registrada: true });
      }
      if (!igual(chave, cfg.chave)) return json({ erro: "Esta planilha já foi registrada com outra chave." }, 401);
      return json({ ok: true, registrada: false });
    }

    if (!cfg.chave || !igual(chave, cfg.chave)) return json({ erro: "Chave da planilha inválida." }, 401);
    const f = ACOES[acao];
    if (!f) return json({ erro: `Ação desconhecida: ${acao}` }, 400);
    return json(await f({ sb, agora: new Date() }, corpo));
  } catch (e: any) {
    console.error(acao, e);
    return json({ erro: String(e?.message ?? e) }, 500);
  }
});
