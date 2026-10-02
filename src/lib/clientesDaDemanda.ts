// Uma demanda pode ser de mais de um cliente: `cliente_id` é o principal (o que aparece primeiro e o que as outras
// abas usam) e `clientes_extras` são os demais. Ao concluir, conta uma demanda feita para cada cliente.
// Regras puras, sem imports do app, para poder testar com `node --test`.

export interface ClientesDaDemanda {
  cliente_id: string | null;
  clientes_extras?: string[] | null;
}

/** Todos os clientes da demanda, o principal primeiro e sem repetir. Sem cliente principal não há extras. */
export function clientesDaDemanda(d: ClientesDaDemanda): string[] {
  if (!d.cliente_id) return [];
  const ids = [d.cliente_id];
  for (const id of d.clientes_extras ?? []) if (id && !ids.includes(id)) ids.push(id);
  return ids;
}

/** Marca ou desmarca um cliente sem mexer nos outros; o principal passa a ser o primeiro que sobrar. */
export function alternarCliente(d: ClientesDaDemanda, id: string): { cliente_id: string | null; clientes_extras: string[] } {
  const atuais = clientesDaDemanda(d);
  const novos = atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id];
  return { cliente_id: novos[0] ?? null, clientes_extras: novos.slice(1) };
}

/**
 * Uma entrada por cliente: a conclusão de uma demanda de 2 clientes vira duas (uma com cada `cliente_id`).
 * `cliente_principal` guarda o cliente principal de verdade, para as ações que mexem na demanda.
 */
export function expandirPorCliente<T extends ClientesDaDemanda>(itens: T[]): (T & { cliente_principal: string | null })[] {
  const saida: (T & { cliente_principal: string | null })[] = [];
  for (const c of itens) {
    const ids = clientesDaDemanda(c);
    if (ids.length <= 1) {
      saida.push({ ...c, cliente_principal: c.cliente_id });
      continue;
    }
    for (const id of ids) saida.push({ ...c, cliente_id: id, cliente_principal: c.cliente_id });
  }
  return saida;
}
