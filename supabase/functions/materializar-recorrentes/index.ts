import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('modo') // 'catch_up' ou normal
    const today = new Date().toISOString().split('T')[0]

    // 1. Buscar tarefas recorrentes que precisam ser materializadas
    // proxima_execucao <= hoje AND recorrente = true
    const { data: tarefasMae, error: fetchError } = await supabaseClient
      .from('demandas')
      .select('*')
      .eq('recorrente', true)
      .lte('proxima_execucao', today)

    if (fetchError) throw fetchError

    const resultados = []

    for (const mae of tarefasMae) {
      // Verificar se já existe instância filha para hoje para evitar duplicatas
      const { data: existente } = await supabaseClient
        .from('demandas')
        .select('id')
        .eq('recorrente_pai_id', mae.id)
        .gte('created_at', today + 'T00:00:00Z')
        .limit(1)

      if (existente && existente.length > 0) {
        resultados.push({ id: mae.id, status: 'pular', motivo: 'já existe filha hoje' })
        continue
      }

      // 2. Criar instância filha em "Fazer hoje"
      const { data: filha, error: createError } = await supabaseClient
        .from('demandas')
        .insert([{
          titulo: mae.titulo,
          descricao: mae.descricao,
          cliente_id: mae.cliente_id,
          prioridade: mae.prioridade,
          status: 'fazer_hoje',
          user_id: mae.user_id,
          recorrente_pai_id: mae.id,
          ordem: 0
        }])
        .select()
        .single()

      if (createError) {
        resultados.push({ id: mae.id, status: 'erro', erro: createError.message })
        continue
      }

      // 3. Recalcular proxima_execucao da mãe
      const { data: proximaData } = await supabaseClient
        .rpc('calcular_proxima_execucao', {
          p_tipo: mae.frequencia_tipo,
          p_dias_semana: mae.frequencia_dias_semana,
          p_dia_mes: mae.frequencia_dia_mes,
          p_intervalo_dias: mae.frequencia_intervalo_dias,
          p_ultima_execucao: today,
          p_data_referencia: today
        })

      await supabaseClient
        .from('demandas')
        .update({ 
          ultima_execucao: today,
          proxima_execucao: proximaData
        })
        .eq('id', mae.id)

      resultados.push({ id: mae.id, status: 'sucesso', filha_id: filha.id, proxima: proximaData })
    }

    return new Response(JSON.stringify({ success: true, processed: resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
