export function lerConfig(env = process.env) {
  const obrigatoria = (nome) => {
    const v = env[nome];
    if (!v) throw new Error(`Falta a variável de ambiente ${nome}`);
    return v;
  };
  return {
    porta: Number(env.PORTA || 8080),
    workerKey: obrigatoria("WORKER_KEY"),
    swipeKey: obrigatoria("SWIPE_KEY"),
    supabaseUrl: obrigatoria("SUPABASE_URL").replace(/\/+$/, ""),
    versao: env.VERSAO || "1.0.0",
  };
}
