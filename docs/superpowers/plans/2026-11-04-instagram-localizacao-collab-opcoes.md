# Instagram: localização, colaboradores e opções avançadas completas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o que falta na tela de postagem do Instagram: busca de lugar pelo nome funcionando, colaboradores mostrando o perfil da conta convidada e testados de verdade, opções avançadas visíveis, e lembrete para o que a API não faz (ocultar curtidas e compartilhamentos).

**Architecture:** Função `instagram` no Supabase (Deno, Graph API v23.0) continua sendo a única que fala com a Meta. A tela só ganha um pedido novo (`perfil`) e duas opções no jsonb `opcoes` de `ig_posts`. O que depende da Meta (revisão do app e token com permissão nova) é do André, guiado por prints; o código já fica pronto para quando liberar.

**Tech Stack:** React + TanStack Router, shadcn/ui, Supabase Edge Functions (Deno), Vitest (`npm test`), Playwright (`tools/auditoria-mobile`), Graph API v23.0.

**Spec:** este plano nasce do levantamento de 04/11/2026 (abaixo), não há spec separada. Contexto: `docs/superpowers/specs/2026-10-03-instagram-etapas-2-3-design.md` e a nota `_knowledge/modulos/instagram.md` do cofre.

## Levantamento de 04/11/2026 (o que falta e por quê)

| Pedido | Hoje | O que falta | De quem |
|---|---|---|---|
| Localização pelo nome | `pages/search` responde "Authorization Error (código 100)"; ler página pública pelo nome também falha. Funcionam: páginas da BM, link/id colado, lugares usados | O app PostBooster precisa da feature **Page Public Metadata Access** (ou **Page Public Content Access**) aprovada na revisão da Meta, com a BM verificada | André (Meta), eu preparo textos e roteiro |
| Colaboradores | Campo nas Opções avançadas, até 3, enviado como `collaborators` (feed, reels e carrossel; story não aceita). Nunca testado de verdade | Mostrar foto, nome e seguidores da conta convidada antes de publicar (`business_discovery`; só conta comercial ou de criador; exige `instagram_manage_insights` no token) e um teste real com convite aceito | código + André (token novo e aceitar convite) |
| Ocultar curtidas e compartilhamentos | A API de publicação não tem esse campo (conferido em 04/11 na referência `POST /{ig-user-id}/media`); só no app, depois de publicado | Lembrete por post na lista ("Falta ocultar curtidas no app") com botão Feito | código |
| Desativar comentários | Já existe e foi testado em 04/10, mas fica escondido no painel fechado | Resumo no cabeçalho e painel aberto quando há opção marcada | código |

Fora, de propósito: música da biblioteca, figurinhas e enquetes, privacidade, localização e colaborador no Facebook. Existem na API e ficam para quando o André pedir: `is_ai_generated`, parceria paga (`is_paid_partnership`, `branded_content_sponsor_ids`), enquete na legenda (`poll_attachment`), `is_comment_prompt_used`, reels de teste (`trial_params`), marcação de produtos.

## Global Constraints

- Nunca acessar a Meta (Business Suite, painel do app): o André manda prints e o Claude guia. Só a função `instagram` chama a API.
- Graph API `v23.0` (`GRAPH` em `supabase/functions/instagram/meta.ts`). Sem dependência nova.
- Segredos só nos secrets do Supabase (`supabase secrets set`) e em `%USERPROFILE%\.gestao\`. Nunca no repositório nem no cofre.
- Textos da interface em português do Brasil. Rótulos de botão únicos na tela.
- Testes: `npm test` (Vitest) e scripts de tela em `tools/auditoria-mobile` (envio ao R2 só funciona no site, não no localhost).
- Deploy da função: `npx supabase functions deploy instagram --project-ref uajusldnvzgakffofkhl`. Site: push em `main` publica na Cloudflare.
- Teste real de publicação só com autorização do André e só na conta que ele indicar.

---

### Task 1: Resumo das opções avançadas no cabeçalho e painel aberto quando há opção

**Files:**
- Modify: `src/lib/instagramPost.ts` (fim do arquivo)
- Modify: `src/components/instagram/OpcoesAvancadas.tsx:20-37`
- Test: `src/lib/instagramPost.test.ts`

**Interfaces:**
- Produces: `resumoOpcoes(opcoes: OpcoesPost | null | undefined): string` ("" quando não há nada marcado).

- [ ] **Step 1: Teste que falha**

```ts
import { resumoOpcoes } from "./instagramPost";

describe("resumoOpcoes", () => {
  it("lista o que está marcado, separado por ponto", () => {
    expect(resumoOpcoes({ comentarios_desativados: true, colaboradores: ["ana", "bia"] })).toBe("Comentários desativados · 2 colaboradores");
    expect(resumoOpcoes({ colaboradores: ["ana"], capa_chave: "x", audio_nome: "Som" })).toBe("1 colaborador · Capa · Áudio: Som");
    expect(resumoOpcoes({ lembrar_ocultar_curtidas: true })).toBe("Lembrar de ocultar curtidas");
  });
  it("vazio quando nada marcado", () => {
    expect(resumoOpcoes(null)).toBe("");
    expect(resumoOpcoes({ colaboradores: [] })).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/instagramPost.test.ts`
Expected: FAIL, `resumoOpcoes` não exportada.

- [ ] **Step 3: Implementar**

Em `supabase/functions/instagram/meta.ts`, na interface `OpcoesPost`, acrescentar:

```ts
  lembrar_ocultar_curtidas?: boolean; // só lembrete: a API não oculta curtidas
```

Em `src/lib/instagramPost.ts`:

```ts
/** Texto curto do que está marcado nas opções avançadas, para o cabeçalho do painel. */
export function resumoOpcoes(o: OpcoesPost | null | undefined): string {
  if (!o) return "";
  const n = o.colaboradores?.length ?? 0;
  return [
    o.comentarios_desativados && "Comentários desativados",
    n > 0 && `${n} colaborador${n > 1 ? "es" : ""}`,
    o.capa_chave && "Capa",
    o.audio_nome && `Áudio: ${o.audio_nome}`,
    o.lembrar_ocultar_curtidas && "Lembrar de ocultar curtidas",
  ].filter(Boolean).join(" · ");
}
```

Em `OpcoesAvancadas.tsx`:

```tsx
const resumo = resumoOpcoes(opcoes);
const [aberto, setAberto] = useState(!!resumo);
// ...no botão do cabeçalho, no lugar do texto fixo:
<span className="min-w-0 truncate text-left">Opções avançadas{resumo && <span className="ml-2 font-normal text-muted-foreground">{resumo}</span>}</span>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/instagramPost.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.app.json` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagramPost.ts src/lib/instagramPost.test.ts src/components/instagram/OpcoesAvancadas.tsx supabase/functions/instagram/meta.ts
git commit -m "feat: opções avançadas do Instagram mostram o resumo no cabeçalho e abrem quando há opção marcada"
```

---

### Task 2: Lembrete de ocultar curtidas e compartilhamentos

**Files:**
- Modify: `src/components/instagram/OpcoesAvancadas.tsx` (dentro do bloco `instagram &&`)
- Modify: `src/components/instagram/Posts.tsx:91-107`
- Modify: `src/lib/instagram.ts` (nova função)
- Test: `tools/auditoria-mobile/testar-instagram.mjs` (passo novo)

**Interfaces:**
- Consumes: `OpcoesPost.lembrar_ocultar_curtidas` (Task 1).
- Produces: `marcarCurtidasOcultadas(id: string, opcoes: OpcoesPost | null): Promise<void>` em `src/lib/instagram.ts`.

- [ ] **Step 1: Interruptor no painel** (abaixo de "Desativar comentários"; só `instagram` e não story: o componente recebe `story?: boolean` novo, passado por `CriarPost.tsx` onde `<OpcoesAvancadas` é montado)

```tsx
{instagram && !story && (
  <label className="flex items-center justify-between gap-2 text-sm">
    <span>Lembrar de ocultar curtidas e compartilhamentos <span className="block text-xs text-muted-foreground">A API da Meta não faz isso; o lembrete fica na lista de posts até você marcar Feito.</span></span>
    <Switch checked={!!opcoes.lembrar_ocultar_curtidas} onCheckedChange={(v) => onMudar({ lembrar_ocultar_curtidas: v })} />
  </label>
)}
```

- [ ] **Step 2: Função de dados**

```ts
/** Apaga o lembrete de ocultar curtidas depois que o André fez isso no app. */
export async function marcarCurtidasOcultadas(id: string, opcoes: OpcoesPost | null) {
  const { error } = await supabase.from("ig_posts").update({ opcoes: { ...(opcoes ?? {}), lembrar_ocultar_curtidas: false } }).eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Na lista de posts**, logo após a linha do `p.aviso` (linha 91):

```tsx
{p.status === "publicado" && p.rede === "instagram" && p.opcoes?.lembrar_ocultar_curtidas && (
  <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
    Falta ocultar curtidas e compartilhamentos no app do Instagram.
    {botao("Feito, curtidas ocultadas", <Check size={13} />, () => agir(() => marcarCurtidasOcultadas(p.id, p.opcoes)))}
  </p>
)}
```

Importar `Check` de `lucide-react` e `marcarCurtidasOcultadas` de `@/lib/instagram`. Conferir que o tipo da linha em `Posts.tsx` tem `opcoes: OpcoesPost | null` (vem do `select("*")`; se o tipo gerado for `Json`, fazer `p.opcoes as OpcoesPost | null`).

- [ ] **Step 4: Teste de tela** em `testar-instagram.mjs`: abrir Postar, abrir "Opções avançadas", ligar o interruptor pelo rótulo "Lembrar de ocultar curtidas e compartilhamentos", conferir que o cabeçalho mostra "Lembrar de ocultar curtidas". Rodar no servidor local (`npm run dev`, porta do script).

- [ ] **Step 5: Commit**

```bash
git add src/components/instagram/OpcoesAvancadas.tsx src/components/instagram/CriarPost.tsx src/components/instagram/Posts.tsx src/lib/instagram.ts tools/auditoria-mobile/testar-instagram.mjs
git commit -m "feat: lembrete por post para ocultar curtidas e compartilhamentos no app do Instagram"
```

---

### Task 3: Erro da Meta por inteiro e `appsecret_proof` opcional

Motivo: a busca de lugares hoje devolve só "Authorization Error (código 100)", sem a frase da Meta que diz o que falta. E a doc do Pages Search pede token de usuário **com o segredo do app** quando "Exigir segredo do app" está ligado.

**Files:**
- Modify: `supabase/functions/instagram/meta.ts:182-204`
- Modify: `src/components/instagram/EscolherLocal.tsx:10-15`
- Test: `src/lib/instagramMeta.test.ts`

**Interfaces:**
- Produces: `erroMeta` passa a incluir `message` quando `error_user_msg` existe e é diferente; `graph()` manda `appsecret_proof` quando o secret `META_APP_SECRET` está definido.

- [ ] **Step 1: Teste que falha**

```ts
it("erroMeta mostra a mensagem técnica junto da mensagem ao usuário", () => {
  const texto = erroMeta({ error: { code: 100, error_user_msg: "Authorization Error", message: "(#100) Pages Public Content Access requires either app secret proof or an app token" } }, 400);
  expect(texto).toContain("Authorization Error");
  expect(texto).toContain("Pages Public Content Access");
});
```

- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/lib/instagramMeta.test.ts`.

- [ ] **Step 3: Implementar** em `erroMeta`:

```ts
const detalhe = e.error_user_msg && e.message && e.error_user_msg !== e.message ? ` [${e.message}]` : "";
const texto = `Meta: ${e.error_user_msg || e.message || "erro"}${detalhe} (código ${e.code ?? "?"}${e.error_subcode ? `, subcódigo ${e.error_subcode}` : ""})`;
```

Em `graph()`, antes de montar `corpo`:

```ts
const segredo = Deno.env.get("META_APP_SECRET");
const prova = segredo ? { appsecret_proof: await hmacHex(segredo, token) } : {};
const corpo = new URLSearchParams({ ...params, ...prova, access_token: token });
```

```ts
async function hmacHex(chave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

`meta.ts` é importado pela tela (Vite): `Deno` não existe lá. Proteger: `const segredo = typeof Deno !== "undefined" ? Deno.env.get("META_APP_SECRET") : undefined;` e declarar `declare const Deno: any;` no topo se o `tsc` reclamar (conferir como `passo.ts` e `index.ts` já lidam com isso; `graph()` só roda no Deno).

Em `EscolherLocal.tsx`, `explicar()` passa a reconhecer também `Authorization Error` e `Public Content Access`:

```ts
return /Page Public|Public Content Access|pages_read_engagement|Authorization Error/.test(m)
```

- [ ] **Step 4: Rodar, deploy e conferir**

`npx vitest run src/lib/instagramMeta.test.ts` → PASS. `npx supabase functions deploy instagram --project-ref uajusldnvzgakffofkhl`. Depois:

```bash
node -e 'fetch(process.env.VITE_SUPABASE_URL+"/functions/v1/instagram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao:"locais",q:"Kipão"})}).then(r=>r.text()).then(console.log)'
```

Anotar a frase completa da Meta no cofre (`_knowledge/modulos/instagram.md`, Pendências): é ela que diz se falta a feature ou o `appsecret_proof`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/instagram/meta.ts src/lib/instagramMeta.test.ts src/components/instagram/EscolherLocal.tsx
git commit -m "fix: erro da Meta completo na busca de lugares e appsecret_proof quando o segredo do app existir"
```

---

### Task 4 (André, guiado por prints): liberar a busca de lugares na Meta

Sem código. Entrega: `{acao:"locais", q:"Kipão"}` devolve lugares.

- [ ] **Step 1: Verificação da empresa.** No Business Manager "André Lopes - Portfólio" → Configurações da empresa → Central de segurança → Verificação da empresa. Sem isso a Meta não aprova a feature. Mandar print do estado.
- [ ] **Step 2: Pedir a feature.** developers.facebook.com → app **PostBooster** → Revisão do app → Permissões e recursos → buscar **Page Public Metadata Access**. Se não aparecer (a Meta diz que foi substituída), pedir **Page Public Content Access**. Mandar print da tela do pedido.
- [ ] **Step 3: Preencher o pedido** com este texto (inglês, como a Meta pede) e um vídeo da tela:

> Our internal tool (Gestão de Operação) schedules Instagram posts for the business accounts we manage. When composing a post, the user types a place name; we call `GET /pages/search?q=...&fields=id,name,location` only to list Pages that have a physical location, so the user can pick one and we send its ID as `location_id` to `POST /{ig-user-id}/media`. We do not store, display or analyze any other public Page data.

Roteiro do vídeo (gravar no site, 1 a 2 minutos): abrir /instagram → Postar → Adicionar localização → digitar um nome → mostrar a lista → escolher → publicar um post de teste na @kobegrowth → abrir o post e mostrar o lugar.
- [ ] **Step 4: Enquanto espera** (dias a semanas): continuar usando link/id da página do lugar e as páginas da BM.
- [ ] **Step 5: Aprovado:** rodar o comando do Task 3, passo 4. Se ainda falhar com "requires either app secret proof or an app token", o André copia o segredo do app (Configurações → Básico → Chave secreta do app) e o Claude grava com `npx supabase secrets set META_APP_SECRET=... --project-ref uajusldnvzgakffofkhl` (valor nunca no chat em texto aberto: usar o arquivo em `%USERPROFILE%\.gestao\`).

---

### Task 5: Perfil da conta colaboradora antes de publicar

**Files:**
- Modify: `supabase/functions/instagram/meta.ts` (função pura nova)
- Modify: `supabase/functions/instagram/passo.ts` (ação `perfil`)
- Modify: `supabase/functions/instagram/index.ts:53-59`
- Modify: `src/lib/instagram.ts`
- Modify: `src/components/instagram/OpcoesAvancadas.tsx` (chips abaixo do campo)
- Modify: `src/components/instagram/CriarPost.tsx` (passar `contaId={conta.id}`)
- Test: `src/lib/instagramMeta.test.ts`

**Interfaces:**
- Produces (meta.ts): `camposPerfil(usuario: string): string | null` → `business_discovery.username(ana){username,name,profile_picture_url,followers_count}`; `null` se o nome tiver caractere fora de `[A-Za-z0-9._]`.
- Produces (passo.ts): `perfil(token, contaId, usuario): Promise<{ perfil: Perfil | null; motivo?: string }>` com `type Perfil = { username: string; nome: string | null; foto: string | null; seguidores: number | null }`.
- Produces (lib): `buscarPerfil(contaId: string, usuario: string): Promise<{ perfil: Perfil | null; motivo?: string }>`.

- [ ] **Step 1: Teste que falha**

```ts
import { camposPerfil } from "../../supabase/functions/instagram/meta.ts";
it("camposPerfil monta o business_discovery e recusa nome inválido", () => {
  expect(camposPerfil("@Ana.Bia_1")).toBe("business_discovery.username(Ana.Bia_1){username,name,profile_picture_url,followers_count}");
  expect(camposPerfil("ana bia")).toBeNull();
  expect(camposPerfil("")).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`meta.ts`:

```ts
/** Campo `fields` do Business Discovery para ver o perfil público de uma conta comercial ou de criador. */
export function camposPerfil(usuario: string): string | null {
  const u = usuario.replace(/^@+/, "").trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(u) ? `business_discovery.username(${u}){username,name,profile_picture_url,followers_count}` : null;
}
```

`passo.ts`:

```ts
export type Perfil = { username: string; nome: string | null; foto: string | null; seguidores: number | null };
/** Perfil público da conta convidada (só conta comercial ou de criador; exige instagram_manage_insights no token). */
export async function perfil(token: string, contaId: string, usuario: string): Promise<{ perfil: Perfil | null; motivo?: string }> {
  const fields = camposPerfil(usuario);
  if (!fields) return { perfil: null, motivo: "Nome de usuário inválido." };
  try {
    const j = await graph("GET", contaId, token, { fields });
    const b = j.business_discovery;
    return b ? { perfil: { username: b.username, nome: b.name ?? null, foto: b.profile_picture_url ?? null, seguidores: b.followers_count ?? null } } : { perfil: null, motivo: "Conta não encontrada." };
  } catch (e) {
    const m = String((e as Error).message);
    return { perfil: null, motivo: /insights|permiss/i.test(m) ? "Falta a permissão instagram_manage_insights no token da Meta." : "Conta pessoal, privada ou nome errado: a Meta só mostra contas comerciais e de criador." };
  }
}
```

`index.ts`, junto das outras ações:

```ts
if (corpo?.acao === "perfil") return json(await perfil(token, String(corpo.conta_id ?? ""), String(corpo.usuario ?? "")));
```

`src/lib/instagram.ts`:

```ts
export type Perfil = { username: string; nome: string | null; foto: string | null; seguidores: number | null };
export const buscarPerfil = (contaId: string, usuario: string) => chamar<{ perfil: Perfil | null; motivo?: string }>({ acao: "perfil", conta_id: contaId, usuario });
```

`OpcoesAvancadas.tsx`: prop nova `contaId: string`; estado `perfis: Record<string, { perfil: Perfil | null; motivo?: string } | "buscando">`; efeito com `setTimeout` de 600 ms sobre `opcoes.colaboradores` que busca os que ainda não estão em `perfis`. Abaixo do campo:

```tsx
<div className="flex flex-wrap gap-1">
  {(opcoes.colaboradores ?? []).map((u) => {
    const r = perfis[u];
    return (
      <span key={u} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
        {r === "buscando" || !r ? <Loader2 size={12} className="animate-spin" /> : r.perfil?.foto ? <img src={r.perfil.foto} alt="" className="h-4 w-4 rounded-full" /> : <CircleAlert size={12} className="text-amber-600" />}
        @{u}{r && r !== "buscando" && r.perfil?.nome && <span className="text-muted-foreground">{r.perfil.nome}{r.perfil.seguidores != null && ` · ${r.perfil.seguidores.toLocaleString("pt-BR")}`}</span>}
        {r && r !== "buscando" && !r.perfil && <a href={`https://www.instagram.com/${u}/`} target="_blank" rel="noreferrer" className="underline" title={r.motivo}>conferir</a>}
      </span>
    );
  })}
</div>
```

Importar `CircleAlert` de `lucide-react`. Em `CriarPost.tsx`, passar `contaId={conta.id}` (o `id` de `ig_contas` é o id da conta de Instagram na Meta).

- [ ] **Step 4: Rodar, tipos, deploy**

`npx vitest run src/lib/instagramMeta.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.app.json`. Deploy da função. Na tela, digitar `@kobegrowth` no campo de colaboradores de outra conta: deve aparecer a foto e o nome. Se vier "Falta a permissão instagram_manage_insights", seguir Task 6.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/instagram src/lib/instagram.ts src/lib/instagramMeta.test.ts src/components/instagram/OpcoesAvancadas.tsx src/components/instagram/CriarPost.tsx
git commit -m "feat: colaboradores do Instagram mostram foto, nome e seguidores da conta convidada"
```

---

### Task 6 (André, guiado): token com `instagram_manage_insights`

- [ ] **Step 1:** Business Manager → Configurações da empresa → Usuários → Usuários do sistema → o usuário do PostBooster → Gerar novo token → app PostBooster → marcar as 10 permissões atuais (a lista está em Admin → Instagram) mais **instagram_manage_insights** → "Nunca expira". Mandar print da lista marcada (não do token).
- [ ] **Step 2:** Salvar o token em `%USERPROFILE%\.gestao\` (arquivo próprio) e o Claude roda `npx supabase secrets set META_TOKEN=... --project-ref uajusldnvzgakffofkhl` lendo do arquivo.
- [ ] **Step 3:** Admin → Instagram deve listar 11 permissões com ✓. Repetir o passo 4 do Task 5.

---

### Task 7 (André + Claude): teste real de colaboração

- [ ] **Step 1:** O André escolhe duas contas que ele controla: A publica, B recebe o convite (B precisa ser pública). Informar no chat.
- [ ] **Step 2:** Acrescentar ao `tools/auditoria-mobile/publicar-teste-instagram.mjs` a variável `COLAB` (lista de @ separada por vírgula): antes de clicar em publicar, abrir "Opções avançadas" e preencher o campo rotulado `Colaboradores (até 3, Instagram)`:

```js
if (process.env.COLAB) {
  await p.getByRole("button", { name: /Opções avançadas/ }).click();
  await p.getByLabel(/Colaboradores/).fill(process.env.COLAB);
}
```

- [ ] **Step 3:** Rodar `COLAB=@contaB node publicar-teste-instagram.mjs contaA <pasta> <prints> carrossel` com autorização expressa do André. O André aceita o convite no app da conta B e manda print do post aparecendo no perfil de B.
- [ ] **Step 4:** Excluir o post pelo sistema (botão Excluir). Registrar no cofre: colaboradores testados, data, contas.

---

### Task 8: Cofre e textos de aviso

- [ ] **Step 1:** Atualizar o aviso em `OpcoesAvancadas.tsx` para citar o lembrete: "A API da Meta não permite ocultar curtidas e visualizações (use o lembrete acima e faça no app depois de publicado), música da biblioteca, figurinhas e enquetes."
- [ ] **Step 2:** Cofre: `_knowledge/modulos/instagram.md` (Como funciona, Dados: `opcoes.lembrar_ocultar_curtidas`, Pendências), `_memory/current-state.md` (uma linha), topo de `_memory/historico.md`, `_decisions/2026-11-04-instagram-localizacao-collab-opcoes.md` (o levantamento acima e o que ficou de fora), `_learnings/` se a frase completa da Meta ensinar algo novo.
- [ ] **Step 3:** Commit `docs: plano e registro do Instagram (localização, colaboradores, opções)` e push.

## Ordem sugerida

1. Tasks 1, 2 e 3 (só código, 1 sessão), deploy e push.
2. Task 5 (código pronto, mostra o motivo enquanto o token não tem a permissão).
3. Tasks 4 e 6 (André, Meta), em paralelo; depois 7.
4. Task 8 no fim de cada sessão.
