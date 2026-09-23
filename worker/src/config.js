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
    versao: env.VERSAO || "1.0.0",
  };
}
