import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

  // Desabilitado por solicitação do usuário: as tarefas recorrentes devem ficar apenas na coluna "Recorrentes"
  // e não devem gerar instâncias automáticas em "Fazer hoje".
  return new Response(JSON.stringify({ 
    success: true, 
    message: "Materialização automática desabilitada. As tarefas recorrentes permanecem na coluna Recorrentes." 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
