# Instagram, plano A (prova de acesso) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aba `/instagram` com o botão "Sincronizar contas", que lê da Meta (pelo `META_TOKEN` do usuário do sistema) as contas de Instagram das páginas atribuídas e grava em `ig_contas`, para provar que as contas dos parceiros funcionam.

**Architecture:** função nova `instagram` (Deno, `verify_jwt = false`) com a ação `sincronizar`, que chama `GET /me/accounts` da Graph API e faz upsert em `ig_contas`; regras puras em `supabase/functions/instagram/meta.ts`, testadas por `src/lib/instagramMeta.test.ts`; tela simples em `src/routes/_authenticated/instagram.tsx`, item no menu Operação acima de "Google Meu Negócio".

**Tech Stack:** Supabase (Lovable Cloud) edge functions em Deno, Postgres, React + TanStack Router, `node --test` para os testes.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-posts-design.md` (seções 2, 3 e 5). O plano B (posts, publicação, tela de criar post) só é escrito depois da prova.

## Global Constraints

- Tudo o que o André lê em português; textos da tela em português.
- O Claude nunca acessa a Meta: só a função `instagram` chama a Graph API, com o segredo `META_TOKEN` (já cadastrado no Lovable).
- Sem chave de publicação e sem login (decisão do André; a segurança do projeto vem depois).
- RLS das tabelas novas aberta como o resto: `FOR ALL USING (true) WITH CHECK (true)`.
- Ponytail: o menor código que resolve; sem dependência nova.
- Arquivos do repositório com CRLF: edite com as ferramentas de edição, não com `sed` que troque finais de linha.

---

### Task 1: Regras da Meta (puras) com teste

**Files:**
- Create: `supabase/functions/instagram/meta.ts`
- Test: `src/lib/instagramMeta.test.ts`

**Interfaces:**
- Produces: `GRAPH: string`; `interface PaginaMeta`; `interface ContaIg { id; usuario; nome; foto_url; pagina_id; pagina_tem_local }`; `contasDasPaginas(paginas: PaginaMeta[]): ContaIg[]`; `erroMeta(corpo: any, status: number): string`; `listarTudo(url: string): Promise<any[]>`.

- [ ] **Step 1: Escrever o teste que falha** — `src/lib/instagramMeta.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { contasDasPaginas, erroMeta } from "../../supabase/functions/instagram/meta.ts";

test("contasDasPaginas: uma conta por Instagram ligado, sem repetir; página sem Instagram fica de fora", () => {
  const r = contasDasPaginas([
    { id: "p1", name: "Loja A", location: { street: "Rua 1", city: "Brasília" }, instagram_business_account: { id: "ig1", username: "lojaa", name: "Loja A", profile_picture_url: "https://x/a.jpg" } },
    { id: "p2", name: "Página sem Instagram" },
    { id: "p3", name: "Loja A (outra página)", instagram_business_account: { id: "ig1", username: "lojaa" } },
    { id: "p4", name: "Clínica B", location: null, instagram_business_account: { id: "ig2", username: "clinicab" } },
  ]);
  assert.deepEqual(r, [
    { id: "ig1", usuario: "lojaa", nome: "Loja A", foto_url: "https://x/a.jpg", pagina_id: "p1", pagina_tem_local: true },
    { id: "ig2", usuario: "clinicab", nome: "Clínica B", foto_url: null, pagina_id: "p4", pagina_tem_local: false },
  ]);
});

test("erroMeta: token inválido, sem permissão e erro genérico em português", () => {
  assert.match(erroMeta({ error: { code: 190, message: "x" } }, 400), /META_TOKEN/);
  assert.match(erroMeta({ error: { code: 200, message: "Requires pages_show_list" } }, 403), /^Sem permissão na Meta: Requires pages_show_list$/);
  assert.equal(erroMeta({ error: { code: 1, message: "Falhou" } }, 500), "Meta: Falhou (código 1)");
  assert.equal(erroMeta(null, 502), "A Meta respondeu 502.");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/instagramMeta.test.ts`
Expected: FAIL (módulo `meta.ts` não existe).

- [ ] **Step 3: Implementar** — `supabase/functions/instagram/meta.ts`:

```ts
// Graph API da Meta, usada só pela função instagram (o token vem do segredo META_TOKEN, nunca do navegador).
// deno-lint-ignore-file no-explicit-any

// ponytail: versão fixa da Graph API; trocar quando a Meta avisar que ela vai sair (cada versão dura cerca de 2 anos).
export const GRAPH = "https://graph.facebook.com/v23.0";

export interface PaginaMeta {
  id: string;
  name?: string;
  location?: { street?: string; city?: string } | null;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } | null;
}

export interface ContaIg {
  id: string;
  usuario: string;
  nome: string;
  foto_url: string | null;
  pagina_id: string;
  /** A página tem endereço: pode servir de localização dos posts */
  pagina_tem_local: boolean;
}

/** Contas de Instagram das páginas que o token enxerga. Página sem Instagram ligado fica de fora; conta repetida entra uma vez. */
export function contasDasPaginas(paginas: PaginaMeta[]): ContaIg[] {
  const vistas = new Set<string>();
  const saida: ContaIg[] = [];
  for (const p of paginas) {
    const ig = p.instagram_business_account;
    if (!ig?.id || vistas.has(ig.id)) continue;
    vistas.add(ig.id);
    saida.push({
      id: ig.id,
      usuario: ig.username ?? "",
      nome: ig.name || p.name || ig.username || ig.id,
      foto_url: ig.profile_picture_url ?? null,
      pagina_id: p.id,
      pagina_tem_local: !!(p.location && (p.location.street || p.location.city)),
    });
  }
  return saida;
}

/** Mensagem em português para uma resposta de erro da Graph API. */
export function erroMeta(corpo: any, status: number): string {
  const e = corpo?.error;
  if (!e) return `A Meta respondeu ${status}.`;
  if (e.code === 190) return "O token da Meta (META_TOKEN) é inválido ou expirou. Gere outro no usuário do sistema e troque o segredo no Lovable.";
  if (e.code === 10 || e.code === 200) return `Sem permissão na Meta: ${e.message}`;
  return `Meta: ${e.message ?? "erro"} (código ${e.code ?? "?"})`;
}

/** GET na Graph API juntando todas as páginas de resultado (`paging.next`). Prazo de 20 s por chamada. */
export async function listarTudo(url: string): Promise<any[]> {
  const itens: any[] = [];
  let proxima: string | undefined = url;
  for (let i = 0; proxima && i < 20; i++) {
    const r: Response = await fetch(proxima, { signal: AbortSignal.timeout(20_000) });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(erroMeta(corpo, r.status));
    itens.push(...(corpo?.data ?? []));
    proxima = corpo?.paging?.next;
  }
  return itens;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/instagramMeta.test.ts`
Expected: PASS (2 testes). Depois `npm test` inteiro: tudo passando.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/instagram/meta.ts src/lib/instagramMeta.test.ts
git commit -m "Instagram: regras da Graph API (contas das páginas, erros em português)"
```

---

### Task 2: Tabela `ig_contas` e função `instagram` (ação `sincronizar`)

**Files:**
- Create: `supabase/migrations/20261003000000_instagram_contas.sql`
- Create: `supabase/functions/instagram/index.ts`
- Modify: `supabase/config.toml` (acrescentar o bloco da função)
- Modify: `src/integrations/supabase/types.ts` (tabela `ig_contas`, para o front tipar sem `as any`)

**Interfaces:**
- Consumes: `GRAPH`, `contasDasPaginas`, `erroMeta`, `listarTudo` (Task 1).
- Produces: `GET /functions/v1/instagram` → `{ ok, servico: "instagram", token: boolean }`; `POST {acao: "sincronizar"}` → `{ contas: number, paginas: number }` ou `{ erro: string }` com status 4xx/5xx.

- [ ] **Step 1: Migration** — `supabase/migrations/20261003000000_instagram_contas.sql`:

```sql
-- Instagram (agendador, etapa 1, plano A): contas de Instagram que o usuário do sistema da BM enxerga.
-- Preenchida pela função instagram (ação sincronizar). Conta que sumiu da Meta fica ativa = false (nunca é apagada).
CREATE TABLE IF NOT EXISTS public.ig_contas (
  id text PRIMARY KEY,
  usuario text NOT NULL DEFAULT '',
  nome text NOT NULL DEFAULT '',
  foto_url text,
  pagina_id text,
  pagina_tem_local boolean NOT NULL DEFAULT false,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ativa boolean NOT NULL DEFAULT true,
  sincronizada_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ig_contas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ig_contas' AND policyname = 'ig_contas_all') THEN
    CREATE POLICY "ig_contas_all" ON public.ig_contas FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
```

- [ ] **Step 2: Função** — `supabase/functions/instagram/index.ts`:

```ts
// Agendador do Instagram (spec docs/superpowers/specs/2026-10-02-instagram-posts-design.md).
//   GET                         -> { ok, servico, token }   (token = o segredo META_TOKEN existe)
//   POST { acao: "sincronizar" } -> { contas, paginas }     lê as páginas do usuário do sistema e grava ig_contas
// verify_jwt = false (supabase/config.toml); sem chave de acesso, por decisão do André até o projeto de segurança.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { GRAPH, contasDasPaginas, listarTudo } from "./meta.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sincronizar(sb: any, token: string) {
  const campos = "id,name,location,instagram_business_account{id,username,name,profile_picture_url}";
  const paginas = await listarTudo(`${GRAPH}/me/accounts?fields=${encodeURIComponent(campos)}&limit=100&access_token=${encodeURIComponent(token)}`);
  const contas = contasDasPaginas(paginas);
  const agora = new Date().toISOString();
  if (contas.length) {
    // Upsert só com as colunas da Meta: cliente_id (escolhido na tela) não é tocado
    const { error } = await sb.from("ig_contas").upsert(contas.map((c) => ({ ...c, ativa: true, sincronizada_em: agora })), { onConflict: "id" });
    if (error) throw new Error(error.message);
    const ids = contas.map((c) => `"${c.id}"`).join(",");
    const { error: e2 } = await sb.from("ig_contas").update({ ativa: false }).not("id", "in", `(${ids})`);
    if (e2) throw new Error(e2.message);
  }
  return { contas: contas.length, paginas: paginas.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = Deno.env.get("META_TOKEN") ?? "";
  if (req.method === "GET") return json({ ok: true, servico: "instagram", token: !!token });
  if (!token) return json({ erro: "Falta o segredo META_TOKEN no Lovable." }, 500);
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    if (corpo?.acao === "sincronizar") return json(await sincronizar(sb, token));
    return json({ erro: `Ação desconhecida: ${String(corpo?.acao ?? "")}` }, 400);
  } catch (e: any) {
    console.error(corpo?.acao, e);
    return json({ erro: String(e?.message ?? e) }, 502);
  }
});
```

- [ ] **Step 3: `supabase/config.toml`** — acrescentar no fim:

```toml

[functions.instagram]
verify_jwt = false
```

- [ ] **Step 4: Tipos** — em `src/integrations/supabase/types.ts`, dentro de `public.Tables`, acrescentar em ordem alfabética (logo antes da tabela que vier depois de `ig_contas`; se não houver, antes da primeira tabela com nome maior que "ig_contas"):

```ts
      ig_contas: {
        Row: {
          ativa: boolean
          cliente_id: string | null
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          pagina_id: string | null
          pagina_tem_local: boolean
          sincronizada_em: string
          usuario: string
        }
        Insert: {
          ativa?: boolean
          cliente_id?: string | null
          created_at?: string
          foto_url?: string | null
          id: string
          nome?: string
          pagina_id?: string | null
          pagina_tem_local?: boolean
          sincronizada_em?: string
          usuario?: string
        }
        Update: {
          ativa?: boolean
          cliente_id?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          pagina_id?: string | null
          pagina_tem_local?: boolean
          sincronizada_em?: string
          usuario?: string
        }
        Relationships: []
      }
```

- [ ] **Step 5: Conferir** — `npx tsc --noEmit -p .` sem erros; `npm test` passando.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003000000_instagram_contas.sql supabase/functions/instagram/index.ts supabase/config.toml src/integrations/supabase/types.ts
git commit -m "Instagram: tabela ig_contas e função instagram (sincronizar contas)"
```

---

### Task 3: Aba `/instagram` com "Sincronizar contas" e item no menu

**Files:**
- Create: `src/lib/instagram.ts`
- Create: `src/routes/_authenticated/instagram.tsx`
- Modify: `src/lib/nav.tsx` (item acima de "Google Meu Negócio")
- Modify: `src/routeTree.gen.ts` (registro da rota, no mesmo formato do `/gmn`)

**Interfaces:**
- Consumes: tabela `ig_contas`; `POST {acao: "sincronizar"}` (Task 2); `ClienteSelect` (`src/components/ClienteSelect.tsx`: `clientes`, `value`, `onChange(id|null)`, `opcaoVazia`); `loadClientesLite()` e `CACHE_KEYS.clientesLite` (`src/lib/data.ts`); `useCachedState` (`src/lib/pageCache`).
- Produces: `fetchContas(): Promise<ContaInstagram[]>`, `sincronizarContas(): Promise<{contas: number; paginas: number}>`, `vincularCliente(contaId, clienteId)`.

- [ ] **Step 1: Camada de dados** — `src/lib/instagram.ts`:

```ts
// Aba Instagram: contas (ig_contas) e chamadas à função instagram.
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContaInstagram = Tables<"ig_contas">;

const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram`;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro ?? `A função instagram respondeu ${r.status}.`);
  return j as T;
}

export async function fetchContas(): Promise<ContaInstagram[]> {
  const { data, error } = await supabase.from("ig_contas").select("*").order("ativa", { ascending: false }).order("nome");
  if (error) throw error;
  return data ?? [];
}

export const sincronizarContas = () => chamar<{ contas: number; paginas: number }>({ acao: "sincronizar" });

export async function vincularCliente(contaId: string, clienteId: string | null): Promise<void> {
  const { error } = await supabase.from("ig_contas").update({ cliente_id: clienteId }).eq("id", contaId);
  if (error) throw error;
}
```

Se `Tables` não existir como export em `types.ts`, troque por `Database["public"]["Tables"]["ig_contas"]["Row"]` (import de `Database`).

- [ ] **Step 2: Tela** — `src/routes/_authenticated/instagram.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram, Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClienteSelect } from "@/components/ClienteSelect";
import { useCachedState } from "@/lib/pageCache";
import { CACHE_KEYS, loadClientesLite } from "@/lib/data";
import { fetchContas, sincronizarContas, vincularCliente, type ContaInstagram } from "@/lib/instagram";

export const Route = createFileRoute("/_authenticated/instagram")({ component: InstagramPage });

function InstagramPage() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [clientes, setClientes] = useCachedState<{ id: string; nome: string; agencia?: string | null }[]>(CACHE_KEYS.clientesLite, []);

  const carregar = () => fetchContas().then(setContas).catch((e) => toast.error(e.message));
  useEffect(() => {
    carregar();
    loadClientesLite().then(setClientes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizarContas();
      toast.success(`${r.contas} ${r.contas === 1 ? "conta de Instagram" : "contas de Instagram"} em ${r.paginas} ${r.paginas === 1 ? "página" : "páginas"}`);
      await carregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const ligar = async (conta: ContaInstagram, clienteId: string | null) => {
    setContas((prev) => prev && prev.map((c) => (c.id === conta.id ? { ...c, cliente_id: clienteId } : c)));
    try {
      await vincularCliente(conta.id, clienteId);
    } catch (e: any) {
      toast.error(e.message);
      carregar();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instagram</h1>
          <p className="text-sm text-muted-foreground">Contas de Instagram dos clientes ligadas à sua BM. Em breve: criar e agendar posts.</p>
        </div>
        <Button className="gap-2" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar contas
        </Button>
      </div>

      {contas === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
      ) : contas.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhuma conta ainda. Clique em "Sincronizar contas".</CardContent></Card>
      ) : (
        <Card>
          <div className="divide-y">
            {contas.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><Instagram size={18} /></span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">@{c.usuario}</p>
                  </div>
                  {c.pagina_tem_local && <Badge variant="outline" className="gap-1 text-[10px]"><MapPin size={10} /> Localização</Badge>}
                  {!c.ativa && <Badge variant="secondary" className="text-[10px]">Sem acesso</Badge>}
                </div>
                <div className="w-full sm:w-64">
                  <ClienteSelect clientes={clientes} value={c.cliente_id} onChange={(id) => ligar(c, id)} opcaoVazia="Sem cliente" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Menu** — em `src/lib/nav.tsx`, no grupo Operação, uma linha **antes** da de "Google Meu Negócio" (e `Instagram` no import do `lucide-react` do arquivo):

```tsx
      { label: "Instagram", icon: <Instagram size={17} />, to: "/instagram", palavras: ["instagram", "posts", "reels", "carrossel", "agendar", "business suite", "meta", "redes sociais"] },
```

- [ ] **Step 4: Rota no `routeTree.gen.ts`** — copiar cada bloco do `/gmn` trocando `Gmn` por `Instagram` e `gmn` por `instagram`: o `import { Route as AuthenticatedInstagramRouteImport } from './routes/_authenticated/instagram'`, o `const AuthenticatedInstagramRoute = AuthenticatedInstagramRouteImport.update({ id: '/instagram', path: '/instagram', getParentRoute: () => AuthenticatedRoute } as any)`, as entradas em `FileRoutesByFullPath`, `FileRoutesByTo`, `FileRoutesById`, nas uniões `fullPaths`/`to`/`id`, o bloco em `declare module ... FileRoutesByPath` (`'/_authenticated/instagram': { id, path: '/instagram', fullPath: '/instagram', preLoaderRoute: typeof AuthenticatedInstagramRouteImport, parentRoute: typeof AuthenticatedRoute }`), `AuthenticatedRouteChildren` (tipo e valor). Não rodar o gerador local (ele reordena o arquivo inteiro).

- [ ] **Step 5: Conferir** — `npx tsc --noEmit -p .` sem erros; `npm test` passando; servidor local (`npx vite dev --port 5188 --strictPort`): o item "Instagram" aparece acima de "Google Meu Negócio" e `/instagram` abre com "Nenhuma conta ainda" (a sincronização só funciona depois do deploy da função). Matar o vite e `git checkout -- src/routeTree.gen.ts` se o servidor regenerar o arquivo, refazendo o Step 4 se preciso.

- [ ] **Step 6: Commit**

```bash
git add src/lib/instagram.ts src/routes/_authenticated/instagram.tsx src/lib/nav.tsx src/routeTree.gen.ts
git commit -m "Instagram: aba com Sincronizar contas e item no menu acima de Google Meu Negócio"
```

---

### Task 4: Ir ao ar e prova com o André

- [ ] **Step 1:** aplicar a migration `20261003000000_instagram_contas.sql` no banco pelo editor SQL do Lovable (método da chamada `cloud/query` de dentro da página, ver cofre `_knowledge/tecnico/editor-sql-e-migrations.md`) e conferir que `ig_contas` existe.
- [ ] **Step 2:** `git push origin main`; pedir ao chat do Lovable o deploy da função `instagram` (sem publicar o site) e conferir `GET /functions/v1/instagram` → `{"ok":true,"servico":"instagram","token":true}`.
- [ ] **Step 3:** publicar o site (Publicar → Publicar alterações) e conferir no site que a aba abre.
- [ ] **Step 4:** pedir ao André: clicar em "Sincronizar contas" e salvar o print em `prints/`. Prova ok = aparecem contas de Instagram dos **parceiros**. Erro de permissão = parar e decidir com ele (revisão do app).
- [ ] **Step 5:** registrar no cofre (módulo novo `_knowledge/modulos/instagram.md`, histórico, estado atual) e escrever o plano B.
