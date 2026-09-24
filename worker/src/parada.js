// Parada do job em andamento (botão "Pausar" do app). O worker roda um job por vez, então o
// estado é do processo: cada comando externo e cada navegador se registra aqui enquanto vive, e
// `pedirParada` derruba todos de uma vez. O job então termina rápido com JobPausado, sem gastar
// tentativa nem criar o Docs de falha.

export class JobPausado extends Error {
  constructor() {
    super("pausado pelo usuário");
    this.name = "JobPausado";
  }
}

const ativos = new Set();
let pedida = false;

/** Registra como parar algo em andamento; devolve a função que tira o registro. */
export function registrar(parar) {
  if (pedida) {
    // Começou depois do pedido de parada: para na hora
    Promise.resolve().then(parar).catch(() => {});
  }
  ativos.add(parar);
  return () => ativos.delete(parar);
}

export function pedirParada() {
  pedida = true;
  for (const parar of [...ativos]) {
    Promise.resolve().then(parar).catch(() => {});
  }
}

export function paradaPedida() {
  return pedida;
}

/** Lança JobPausado se a parada foi pedida — usado nas fronteiras entre etapas do job. */
export function checarParada() {
  if (pedida) throw new JobPausado();
}

/** Zera o estado no começo de cada job. */
export function reiniciarParada() {
  pedida = false;
  ativos.clear();
}

/**
 * Enquanto o job roda, consulta o status dele no Supabase a cada `intervaloMs`; quando o app
 * marca um status de parada (`pausado`) ou apaga a linha (Cancelar), pede a parada. Sem chave
 * pública configurada, não vigia (o job segue normal). Devolve a função que encerra a vigia.
 * `tabela`/`statusDeParada` servem ao Transcritor (`transcricoes` / `pausada`).
 */
export function vigiarPausa({ jobId, supabaseUrl, anonKey, tabela = "swipe_jobs", statusDeParada = ["pausado"], intervaloMs = 3000, fetch: _fetch = fetch }) {
  if (!anonKey || !jobId) return () => {};
  let parado = false;
  const url = `${supabaseUrl}/rest/v1/${tabela}?id=eq.${encodeURIComponent(jobId)}&select=status`;
  const checar = async () => {
    try {
      const r = await _fetch(url, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
      if (!r.ok) return;
      const linhas = await r.json();
      if (parado || !Array.isArray(linhas)) return;
      // Linha apagada = cancelado no app (o item some junto com o job)
      if (!linhas.length || statusDeParada.includes(linhas[0]?.status)) {
        console.log(JSON.stringify({ evento: linhas.length ? "job.pausa_pedida" : "job.cancelado", id: jobId }));
        pedirParada();
      }
    } catch {
      // rede instável: tenta de novo na próxima volta
    }
  };
  const timer = setInterval(checar, intervaloMs);
  timer.unref?.();
  return () => {
    parado = true;
    clearInterval(timer);
  };
}
