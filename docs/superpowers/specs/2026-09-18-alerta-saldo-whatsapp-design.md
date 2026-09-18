# Alerta de saldo no WhatsApp (n8n + Supabase + Evolution API)

Aprovado em 18/09/2026. Em produção.

## Objetivo
Avisar no grupo de WhatsApp **ALERTA DE SALDO** quando faltarem 3, 2 e 1 dia para acabar a verba
de uma conta de anúncio (aba Saldo). Marcar uma recarga no sistema encerra o ciclo; só avisa de novo
quando voltar a faltar 3 dias.

## Peças
1. **Supabase** (`supabase/migrations/20260918150000_alertas_saldo_whatsapp.sql`)
   - `alertas_saldo_enviados(saldo_ads_id, nivel, recarga_ref, mensagem, enviado_em)` — único por
     (conta, nível, última recarga). `recarga_ref` = `data_ultima_recarga` no envio: uma recarga nova
     muda a referência e reinicia o ciclo sozinha.
   - `alertas_saldo_pendentes()` — lê `saldo_ads_view` (`status_alerta` em alerta/critico/zerado,
     não dispensado), calcula o nível (0 = zerado, 1 ≤ 1 dia, 2 ≤ 2 dias, 3 ≤ 3 dias) e devolve só o
     que ainda não foi avisado neste ciclo, já com a mensagem formatada (moeda da operação, verba
     diária, última recarga, plataformas).
   - `alertas_saldo_marcar(p_saldo_ads_id, p_nivel, p_mensagem)` — registra o envio.
   - `formatar_moeda(valor, moeda)` — R$/US$/€/£ no padrão brasileiro.
2. **n8n** — workflow `[SALDO] Alerta de saldo - WhatsApp (grupo ALERTA DE SALDO)`
   (id `ZP0YQNLhXLhWwii4`, https://test.minuanoai.com.br, fuso America/Sao_Paulo):
   `Todo dia 09:00` → `Supabase - alertas pendentes` (rpc) → `Evolution - enviar no grupo`
   (`POST /message/sendText/André Lopes - API`, número `120363432041928890@g.us`) →
   `Supabase - marcar enviado` (rpc). Saída de erro do envio vai para `Falhou - não marca`:
   o item volta no dia seguinte.
   Credenciais: `Supabase - Gestão de Operação (anon)` (header `apikey`) e `Evolution - Andre Lopes API`.
3. **Mensagem**
   ```
   🚨 *ALERTA DE SALDO - Cliente (Operação)*
   Faltam *2 dias* para acabar a verba na conta.
   Saldo atual estimado: *R$ 1.234,56*
   Verba diária: R$ 300,00 · Última recarga: 10/09 (R$ 3.000,00)
   Plataformas: Meta, Google
   ```

## Regras
- Cada nível sai uma vez por ciclo de recarga; níveis pulados não são enviados depois.
- Saldo zerado sem recarga: um aviso único (nível 0).
- Contas pausadas, cartão, sem recarga, sem verba diária ou com alerta dispensado no sistema não
  geram WhatsApp.
- Checagem 1×/dia às 09:00 (cron `0 9 * * *`).

## Teste
Execução manual em 18/09/2026: 1 alerta real (Odontodents · Principal, nível 1) enviado ao grupo e
registrado; segunda chamada da RPC devolveu vazio.
