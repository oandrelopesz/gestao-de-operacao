// Configuração do orquestrador do Transcritor (serviço `transcritor_orquestrador`, mesma imagem do worker).
export function lerConfigTranscritor(env = process.env) {
  const obrigatoria = (nome) => {
    const v = env[nome];
    if (!v) throw new Error(`Falta a variável de ambiente ${nome}`);
    return v;
  };
  const lista = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const porta = Number(env.PORTA || 8090);
  if (!Number.isFinite(porta) || porta <= 0) throw new Error(`PORTA inválida: ${env.PORTA}`);
  return {
    porta,
    supabaseUrl: obrigatoria("SUPABASE_URL").replace(/\/+$/, ""),
    anonKey: obrigatoria("SUPABASE_ANON_KEY"),
    speachesUrl: (env.SPEACHES_URL || "http://speaches:8000").replace(/\/+$/, ""),
    modelo: env.MODELO || "deepdml/faster-whisper-large-v3-turbo-ct2",
    googleClientId: obrigatoria("GOOGLE_CLIENT_ID"),
    emailsPermitidos: lista(env.EMAILS_PERMITIDOS).map((e) => e.toLowerCase()),
    origens: lista(env.ORIGENS || "https://gestao-de-operacao.lovable.app"),
    pasta: env.PASTA || "/dados/transcritor",
    versao: env.VERSAO || "1.0.0",
  };
}
