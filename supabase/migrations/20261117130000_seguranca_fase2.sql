-- Segurança fase 2 (17/11/2026): fechamentos que não quebram nada.
-- 1) clientes_view passa a respeitar o RLS de quem consulta.
alter view public.clientes_view set (security_invoker = true);

-- 2) Funções internas (gatilhos, cron, edge functions com chave de serviço) deixam de ser
--    chamáveis pelo papel público. Gatilhos não checam EXECUTE ao disparar.
do $$
declare f text;
begin
  foreach f in array array[
    'clientes_encerra_onboarding()','demandas_atualiza_passo()','demandas_recorrente_chegou()',
    'demandas_recorrente_concluida()','demandas_registra_conclusao()','planilha_avisar()',
    'planilha_banco_para_crm()','planilha_crm_para_banco()','planilha_pendencia_obsoleta()',
    'planilha_prospeccao_excluir()','planilha_registrar()','planilha_resumo()',
    'processo_passos_pos_delete()','processo_passos_sync()','processos_sync()',
    'rolar_colunas_por_dia(date)','sincronizar_passo(uuid,boolean)','sincronizar_passos_onboarding()',
    'virar_dia_demandas()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
