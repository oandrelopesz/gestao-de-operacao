// Envio de arquivos: só aceita quem entrou com o Google na conta permitida (mesma regra da edge
// function google-token do swipe file). O ID token vem no cabeçalho `x-google-id-token`.

export class AcessoNegado extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "AcessoNegado";
  }
}

export function criarVerificador({ clientId, emailsPermitidos, fetch: _fetch = fetch, agora = () => Date.now() }) {
  const cache = new Map(); // token → expira (ms)

  return async function verificar(token) {
    if (!token) throw new AcessoNegado("Entre com o Google para enviar arquivos");
    const emCache = cache.get(token);
    if (emCache && emCache > agora()) return true;
    const r = await _fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (!r.ok) throw new AcessoNegado("Login do Google inválido ou expirado");
    const info = await r.json();
    const expira = Number(info.exp) * 1000;
    const email = String(info.email || "").toLowerCase();
    if (info.aud !== clientId) throw new AcessoNegado("Login do Google de outro aplicativo");
    if (!(expira > agora())) throw new AcessoNegado("Login do Google expirado");
    if (info.email_verified !== "true" && info.email_verified !== true) throw new AcessoNegado("E-mail do Google não verificado");
    if (!emailsPermitidos.includes(email)) throw new AcessoNegado("Esta conta do Google não tem acesso");
    cache.set(token, Math.min(expira, agora() + 5 * 60 * 1000));
    return true;
  };
}
