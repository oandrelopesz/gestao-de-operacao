import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { acessoLiberado } from "../_comum/acesso.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!(await acessoLiberado(req))) {
    return new Response(JSON.stringify({ erro: "Não autorizado." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const formattedDate = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

    // 1. Buscar todos os usuários que têm notificação matinal ativa
    const { data: configs, error: configError } = await supabaseClient
      .from('notificacoes_config')
      .select('*')
      .eq('notificacao_matinal_ativa', true)

    if (configError) throw configError

    const resultados = []

    for (const config of configs) {
      if (!config.telegram_bot_token || !config.telegram_chat_id) continue

      // 2. Buscar tarefas de hoje para este usuário
      const { data: tarefas, error: taskError } = await supabaseClient
        .from('demandas')
        .select('*')
        .eq('user_id', config.user_id)
        .eq('status', 'fazer_hoje')

      if (taskError) continue

      if (!tarefas || tarefas.length === 0) {
          resultados.push({ user_id: config.user_id, status: 'pular', motivo: 'sem tarefas hoje' })
          continue
      }

      // 3. Montar mensagem
      const recorrentes = tarefas.filter(t => t.recorrente_pai_id !== null)
      const pontuais = tarefas.filter(t => t.recorrente_pai_id === null)

      let message = `☀️ *Bom dia*\n\nSuas tarefas de hoje (${formattedDate}):\n\n`

      if (recorrentes.length > 0) {
        message += `🔁 *Recorrentes:*\n`
        recorrentes.forEach(t => {
          message += `- ${t.titulo}\n`
        })
        message += `\n`
      }

      if (pontuais.length > 0) {
        message += `📋 *Demandas pontuais:*\n`
        pontuais.forEach(t => {
          message += `- ${t.titulo}\n`
        })
        message += `\n`
      }

      message += `Total: ${tarefas.length} tarefas`

      // 4. Disparar Telegram
      const res = await fetch(`https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown',
        }),
      })

      resultados.push({ user_id: config.user_id, status: 'sucesso', telegram_ok: res.ok })
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
