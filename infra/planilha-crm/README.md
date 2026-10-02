# Apps Script da "Planilha CRM Mestra"

Ponte entre a planilha de leads e o sistema (spec `docs/superpowers/specs/2026-10-01-banco-de-leads-design.md`).

- Planilha: `176k4WPiMeOU1Va8AxSCsGdpzkA1F0lST0m4mbXQrZak` (dona: contato@andrelopes.digital)
- Script ligado: `1xDQ4rcAWhkAQ7dkzH8HXxeuInC0Jg_BmzotPEadz2-R_w3H9DYRKeel0`, arquivo único `Código.gs`
- Edge function: `planilha` (`supabase/functions/planilha`)

## Publicar uma mudança

1. Editar `Codigo.gs` aqui e rodar `node --test src/lib/planilhaGas.test.ts`.
2. Abrir o editor (Extensões > Apps Script na planilha) e colar o arquivo inteiro em `Código.gs` (Ctrl+S).
   O `clasp` desta máquina pede novo login (`invalid_rapt`); colar no editor dispensa.
3. Se mudou `doPost`: Implantar > Gerenciar implantações > editar a implantação "Ponte com o sistema" > Nova versão.
   A URL `/exec` não muda.

## Peças

- Gatilhos instaláveis (criados por CRM > Preparar sincronização): `aoEditar` (edição), `aoMudar` (estrutura),
  `conferir` (a cada 5 min).
- Web App (executa como contato@, acesso "Qualquer pessoa"): o banco avisa por pg_net que há fila; o `doPost` busca
  na edge function e aplica. Quem chama não manda em nada.
- Propriedades: `chave` (script, senha da ponte, nunca exibida); `preparo`, `abas_assinatura`, `abas_conhecidas`,
  `crm_etapas`, `crm_fp`, `crm_pendentes` (documento).
- A URL do Web App fica em `planilha_config.webapp_url` (gravada pelo editor SQL).

## Voltar atrás

`antigo/Codigo.gs` é o script que a planilha usava até 02/10/2026 (CRM próprio da planilha, sem ponte). Há também a cópia
"Planilha CRM Mestra - backup 01-10-2026" no Drive da contato@ e a aba oculta "CRM antigo (backup)" na planilha.
