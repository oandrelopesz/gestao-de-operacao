// Dá login aos scripts de teste sem Google: gera uma sessão real de contato@andrelopes.digital pela API admin
// (service_role lida de %USERPROFILE%\.gestao\seguranca.env, nunca vai para o repo) e a injeta em todo navegador e fetch.
// Uso: node --import ./sessao-teste.mjs testar-taxas.mjs   (ou: npm run teste -- testar-taxas.mjs)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const lerEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const segredos = lerEnv(homedir() + "/.gestao/seguranca.env");
const app = lerEnv(fileURLToPath(new URL("../../.env", import.meta.url)));
const URL_SB = app.VITE_SUPABASE_URL, PUB = app.VITE_SUPABASE_PUBLISHABLE_KEY, S = segredos.SERVICE_ROLE_KEY;
const ref = new globalThis.URL(URL_SB).hostname.split(".")[0];
const fetchOriginal = globalThis.fetch;

const gerar = await (await fetchOriginal(URL_SB + "/auth/v1/admin/generate_link", { method: "POST", headers: { apikey: S, Authorization: "Bearer " + S, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "contato@andrelopes.digital" }) })).json();
const sessao = await (await fetchOriginal(URL_SB + "/auth/v1/verify", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: gerar.hashed_token }) })).json();
if (!sessao.access_token) throw new Error("sessao-teste: não consegui gerar a sessão: " + JSON.stringify(sessao).slice(0, 200));

// fetch do Node: troca o Bearer da chave pública pelo token do André (só em chamadas ao Supabase fora de /auth/)
globalThis.fetch = (entrada, init = {}) => {
  const url = typeof entrada === "string" ? entrada : entrada.url;
  if (url.startsWith(URL_SB) && !url.includes("/auth/v1/")) {
    const h = new Headers(init.headers || (typeof entrada === "object" ? entrada.headers : undefined));
    if ((h.get("authorization") || "").includes(PUB) || h.get("apikey") === PUB) h.set("Authorization", "Bearer " + sessao.access_token);
    init = { ...init, headers: h };
  }
  return fetchOriginal(entrada, init);
};

// navegador: grava a sessão no localStorage de toda página antes de o app carregar
const chave = `sb-${ref}-auth-token`, valor = JSON.stringify(sessao);
const script = `try{if(location.protocol.startsWith("http")&&!location.hostname.endsWith("supabase.co"))localStorage.setItem(${JSON.stringify(chave)},${JSON.stringify(valor)})}catch(e){}`;
const lancar = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const nav = await lancar(...a);
  const ctx = nav.newContext.bind(nav), pag = nav.newPage.bind(nav);
  nav.newContext = async (...b) => { const c = await ctx(...b); await c.addInitScript(script); return c; };
  nav.newPage = async (...b) => { const p = await pag(...b); await p.context().addInitScript(script); return p; };
  return nav;
};
