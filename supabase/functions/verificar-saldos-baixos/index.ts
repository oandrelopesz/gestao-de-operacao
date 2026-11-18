import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { acessoLiberado } from "../_comum/acesso.ts"

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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch alerts
    const { data: alerts, error: alertError } = await supabaseClient
      .from('saldo_ads_view')
      .select('*')
      .neq('status_alerta', 'ok')
      .neq('metodo_pagamento', 'cartao')

    if (alertError) throw alertError

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ message: "No low balances found." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Group by user to fetch their config
    const userIds = [...new Set(alerts.map(a => a.user_id))]
    
    for (const userId of userIds) {
      const { data: config } = await supabaseClient
        .from('notificacoes_config')
        .select('*')
        .eq('user_id', userId)
        .eq('ativo', true)
        .single()

      if (config && config.telegram_bot_token && config.telegram_chat_id) {
        const userAlerts = alerts.filter(a => a.user_id === userId)
        
        for (const alert of userAlerts) {
          const emoji = alert.status_alerta === 'zerado' ? '❌' : alert.status_alerta === 'critico' ? '🚨' : '⚠️'
          const message = `${emoji} *Alerta de saldo*\n\n` +
            `*Cliente:* ${alert.cliente_nome} (${alert.cliente_agencia})\n` +
            `*Plataforma:* ${alert.plataforma.toUpperCase()}\n` +
            `*Saldo atual:* R$ ${alert.saldo_atual.toFixed(2).replace('.', ',')}\n` +
            `*Dias restantes:* ${Math.floor(alert.dias_restantes)} dias\n` +
            `*Previsão de fim:* ${new Date(alert.data_prevista_fim).toLocaleDateString('pt-BR')}\n`

          await fetch(`https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.telegram_chat_id,
              text: message,
              parse_mode: 'Markdown',
            }),
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: alerts.length }), {
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
