// Registro das exclusões de arquivo em andamento, por caminho. Quem vai enviar um arquivo no mesmo caminho espera
// a exclusão pendente terminar: senão o pedido de apagar (partida a frio, nova tentativa) chega ao R2 depois do envio
// e apaga o arquivo novo. Sem dependências do app, para poder ser testado em Node.

export function criarExclusoesPendentes() {
  const pendentes = new Map<string, Promise<void>>();

  return {
    /** Guarda a exclusão do caminho; sai do registro sozinha quando termina (se ainda for a mais recente). */
    registrar(caminho: string, promessa: Promise<unknown>): void {
      const terminou: Promise<void> = promessa.then(() => {}, () => {}); // nunca rejeita
      const anterior = pendentes.get(caminho);
      // Duas exclusões seguidas do mesmo caminho: quem espera aguarda as duas
      const registrada: Promise<void> = anterior ? Promise.all([anterior, terminou]).then(() => {}) : terminou;
      pendentes.set(caminho, registrada);
      void registrada.then(() => {
        if (pendentes.get(caminho) === registrada) pendentes.delete(caminho);
      });
    },

    /**
     * Espera a exclusão pendente do caminho, no máximo `limiteMs`. Resolve na hora se não há nenhuma.
     * Devolve `true` quando não havia pendência ou ela terminou (com sucesso ou não); `false` quando o limite estourou.
     */
    async esperar(caminho: string, limiteMs: number): Promise<boolean> {
      const pendente = pendentes.get(caminho);
      if (!pendente) return true;
      let cronometro: ReturnType<typeof setTimeout> | undefined;
      const limite = new Promise<boolean>((resolve) => {
        cronometro = setTimeout(() => resolve(false), limiteMs);
      });
      try {
        return await Promise.race([pendente.then(() => true), limite]);
      } finally {
        clearTimeout(cronometro);
      }
    },

    /** Quantos caminhos têm exclusão em andamento (para testes). */
    quantidade(): number {
      return pendentes.size;
    },
  };
}

/** Registro único do app (usado pelo salvamento dos Fluxogramas). */
export const exclusoesPendentes = criarExclusoesPendentes();
