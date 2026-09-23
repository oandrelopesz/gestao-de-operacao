// Ajuste do workflow "[SWIPE] Fila de downloads" para a fila com ordem e pausa (23/09/2026).
// Idempotente: pode rodar de novo sem duplicar nada. Usado no template (n8n-workflow.json) e,
// colado no console do n8n, no workflow publicado.
function aplicarFila(nodes) {
  const no = (nome) => {
    const n = nodes.find((x) => x.name === nome);
    if (!n) throw new Error(`nó "${nome}" não encontrado`);
    return n;
  };
  const comGuarda = (nome, guarda) => {
    const p = no(nome).parameters;
    if (!p.url.includes(guarda)) p.url += guarda;
  };

  // 1) A ordem da fila vem da coluna posicao (o app reordena); empate pelo mais antigo
  const ordem = no("Buscar job").parameters.queryParameters.parameters.find((q) => q.name === "order");
  ordem.value = "posicao.asc,created_at.asc";

  // 2) Worker respondeu que o usuário pausou: o app já marcou job e item, não mexe em nada
  const decidir = no("Decidir").parameters;
  const marcador = "if (corpo.ok === true) {";
  if (!decidir.jsCode.includes("corpo.pausado")) {
    decidir.jsCode = decidir.jsCode.replace(
      marcador,
      "// Pausado pelo usuário no app (job e item já estão como 'pausado'): não mexe em nada\n" +
        "if (corpo.pausado) {\n  return [{ json: { acao: 'pausado', job_id: job.id, item_id: job.item_id } }];\n}\n\n" +
        marcador,
    );
  }

  // 3) Devolver/falhar só se ninguém pausou no meio do caminho; sucesso sempre grava
  comGuarda("Devolver para a fila", "&status=eq.rodando");
  comGuarda("Job erro", "&status=eq.rodando");
  comGuarda("Item de volta para a fila", "&status=eq.baixando");
  comGuarda("Item falhou", "&status=eq.baixando");
  return nodes;
}

if (typeof module !== "undefined") module.exports = { aplicarFila };
