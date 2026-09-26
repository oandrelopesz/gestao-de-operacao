export function lerConfig(env = process.env) {
  const obrigatoria = (nome) => {
    const v = env[nome];
    if (!v) throw new Error(`Falta a variável de ambiente ${nome}`);
    return v;
  };
  const porta = Number(env.PORTA || 8080);
  if (!Number.isFinite(porta) || porta <= 0) throw new Error(`PORTA inválida: ${env.PORTA}`);
  return {
    porta,
    workerKey: obrigatoria("WORKER_KEY"),
    swipeKey: obrigatoria("SWIPE_KEY"),
    supabaseUrl: obrigatoria("SUPABASE_URL").replace(/\/+$/, ""),
    // Chave pública (a mesma do app): só para ler o status do job e perceber a pausa. Sem ela o
    // worker funciona, mas o botão "Pausar" só vale para jobs que ainda não começaram.
    supabaseAnonKey: env.SUPABASE_ANON_KEY || null,
    // Fireflies (aba "Fireflies" do app). Opcionais: sem a chave da API (ou sem a chave pública do
    // Supabase, que grava as reuniões), as rotas /fireflies/* respondem 503 e o resto segue normal.
    firefliesApiKey: env.FIREFLIES_API_KEY || null,
    // Segredo do webhook "Transcription completed" (confere o x-hub-signature que o n8n repassa)
    firefliesWebhookSecret: env.FIREFLIES_WEBHOOK_SECRET || null,
    versao: env.VERSAO || "1.0.0",
  };
}
