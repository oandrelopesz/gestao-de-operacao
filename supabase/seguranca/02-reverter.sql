alter view public.clientes_view reset (security_invoker);
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
    execute format('grant execute on function public.%s to public, anon', f);
  end loop;
end $$;
