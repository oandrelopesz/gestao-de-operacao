/**
 * Login com Google (Google Identity Services) para liberar o swipe file em qualquer navegador/
 * dispositivo, sem precisar da chave. O ID token prova a identidade; a edge function `google-token`
 * confere (assinatura + e-mail permitido) e devolve o token do Drive. O ID token fica só em memória.
 */

const GSI_SRC = "https://accounts.google.com/gsi/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleGsi = any;

let scriptPromise: Promise<GoogleGsi> | null = null;

function gis(): GoogleGsi | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).google?.accounts?.id || null;
}

function carregarGis(): Promise<GoogleGsi> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  const pronto = gis();
  if (pronto) return Promise.resolve(pronto);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const g = gis();
      if (g) resolve(g);
      else reject(new Error("Google Identity Services carregou sem a API esperada"));
    };
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Não foi possível carregar o login do Google"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let idTokenCache: { token: string; exp: number } | null = null;

function expDoJwt(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(payload));
    return Number(p.exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

// O ID token vale ~1 h. Fica também na sessão da aba: recarregar a página não pede login de novo
// (mesmo tratamento do token do Drive; some ao fechar a aba).
const CHAVE_SESSAO = "google_id_token";

function guardar(token: string): void {
  idTokenCache = { token, exp: expDoJwt(token) };
  try { sessionStorage.setItem(CHAVE_SESSAO, token); } catch { /* sem storage */ }
}

/** ID token ainda válido (com folga de 2 min), ou null. */
export function idTokenEmCache(): string | null {
  if (!idTokenCache && typeof window !== "undefined") {
    try {
      const salvo = sessionStorage.getItem(CHAVE_SESSAO);
      if (salvo) idTokenCache = { token: salvo, exp: expDoJwt(salvo) };
    } catch { /* sem storage */ }
  }
  if (idTokenCache && idTokenCache.exp - Date.now() > 120_000) return idTokenCache.token;
  return null;
}

export function limparIdToken(): void {
  idTokenCache = null;
  try { sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* sem storage */ }
  const g = gis();
  try {
    g?.disableAutoSelect?.();
  } catch {
    // ignora
  }
}

let iniciadoCom: string | null = null;
// Um único callback global do GIS (o `initialize` só pode registrar um). Quem está aguardando
// (login silencioso ou o botão) assume este ponteiro; o credential sempre é cacheado antes.
let onCredencial: ((idToken: string | null) => void) | null = null;

function garantirInit(g: GoogleGsi, clientId: string): void {
  if (iniciadoCom === clientId) return; // inicializa só uma vez (evita o aviso "initialize() multiple times")
  g.initialize({
    client_id: clientId,
    auto_select: true,
    use_fedcm_for_prompt: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (resp: any) => {
      const cred = resp?.credential || null;
      if (cred) guardar(cred);
      if (onCredencial) onCredencial(cred);
    },
  });
  iniciadoCom = clientId;
}

/**
 * Tenta obter um ID token SEM interação (One Tap / auto-select por FedCM). Resolve com o token, ou
 * null quando o Google precisa de um clique (aí a UI mostra o botão). Nunca rejeita.
 */
export function loginSilencioso(clientId: string): Promise<string | null> {
  const cache = idTokenEmCache();
  if (cache) return Promise.resolve(cache);
  return carregarGis()
    .then(
      (g) =>
        new Promise<string | null>((resolve) => {
          let resolvido = false;
          const done = (v: string | null) => {
            if (!resolvido) {
              resolvido = true;
              if (onCredencial === handler) onCredencial = null;
              resolve(v);
            }
          };
          const handler = (cred: string | null) => done(cred);
          garantirInit(g, clientId);
          onCredencial = handler;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          g.prompt((n: any) => {
            const semUi =
              n?.isNotDisplayed?.() || n?.isSkippedMoment?.() || n?.isDismissedMoment?.();
            if (semUi) done(idTokenEmCache());
          });
          setTimeout(() => done(idTokenEmCache()), 8000);
        }),
    )
    .catch(() => null);
}

/**
 * Renderiza o botão oficial "Entrar com Google" em `container`. Chama `onToken` quando o usuário
 * escolhe a conta (o ID token também fica em cache). Erros de carregamento vão para `onErro`.
 */
export function renderBotaoGoogle(
  clientId: string,
  container: HTMLElement,
  onToken: (idToken: string) => void,
  onErro?: (e: Error) => void,
): void {
  carregarGis()
    .then((g) => {
      garantirInit(g, clientId);
      // este botão passa a ser quem recebe o próximo credential
      onCredencial = (cred) => {
        if (cred) onToken(cred);
      };
      container.innerHTML = "";
      g.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        locale: "pt-BR",
      });
    })
    .catch((e) => onErro?.(e instanceof Error ? e : new Error(String(e))));
}
