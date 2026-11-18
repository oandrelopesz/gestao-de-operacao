# Segurança do banco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** fechar o banco (Supabase `uajusldnvzgakffofkhl`) ao papel `anon`, sem quebrar nenhuma aba, robô ou cron.

**Architecture:** 4 fases com reversão. Fase 1 backup, fase 2 fechamentos que não quebram, fase 3 robôs e edge functions com credencial própria, fase 4 virada (policies `to authenticated` travadas no e-mail, revoke do `anon`).

**Tech Stack:** Postgres/RLS, Supabase Management API (`pgq/q.mjs`), edge functions Deno, n8n API, Portainer.

**Spec:** `Obsidian .../_decisions/2026-11-17-seguranca-do-banco-desenho.md`

## Global Constraints
- Nada de segredo no repo, no front ou no cofre; segredos só em `%USERPROFILE%\.gestao\` e nos secrets de produção.
- Cada fase tem script de reversão em `supabase/seguranca/` antes de ser aplicada.
- Fase 4 só roda depois do teste logado, aba por aba, e do OK do André sobre o resultado.
- E-mail permitido: `contato@andrelopes.digital`.

---

### Task 1: Backup e reversão (fase 1)
**Files:** Create `supabase/seguranca/00-backup-policies.sql` (gerado), `supabase/seguranca/00-backup-grants.sql`, `supabase/seguranca/00-backup-funcoes.sql`
- [ ] Gerar por SQL (pg_policies, information_schema.role_table_grants, pg_proc.proacl/proconfig) os `CREATE POLICY`, `GRANT` e `ALTER FUNCTION ... SET/GRANT` que reproduzem o estado atual.
- [ ] Conferir contagens (policies, grants, funções) contra o banco.
- [ ] Commit.

### Task 2: Fechamentos sem quebra (fase 2)
**Files:** Create `supabase/migrations/20261117130000_seguranca_fase2.sql`, `supabase/seguranca/02-reverter.sql`
- [ ] `ALTER VIEW clientes_view SET (security_invoker=true)`.
- [ ] `ALTER FUNCTION ... SET search_path=public,pg_temp` nas `SECURITY DEFINER`.
- [ ] `REVOKE EXECUTE ... FROM anon` só nas funções que o front e os robôs não chamam por RPC (levantar por grep antes).
- [ ] Teste: login no site, abrir todas as abas, console sem 401/403.

### Task 3: Robôs e edge functions (fase 3)
**Files:** Modify `supabase/functions/*/index.ts`, `worker/src/*`, `infra/*/stack.yml`, workflows do n8n, Apps Script
- [ ] Ler cada edge function com `verify_jwt=false`; exigir JWT do André ou segredo compartilhado.
- [ ] Trocar a chave pública pela de serviço no worker, n8n, Apps Script e crons.
- [ ] Teste de cada robô após a troca.

### Task 4: Virada (fase 4)
**Files:** Create `supabase/migrations/20261117140000_seguranca_fase4.sql`, `supabase/seguranca/04-reverter.sql`
- [ ] Ligar RLS nas 13 tabelas; trocar policies `true` por `to authenticated using (auth.jwt()->>'email'='contato@andrelopes.digital')`; `REVOKE ALL ... FROM anon`; bucket `notas` privado.
- [ ] Teste logado aba por aba + `curl` com a chave pública em cada tabela (401/vazio).
- [ ] Registrar no cofre.
