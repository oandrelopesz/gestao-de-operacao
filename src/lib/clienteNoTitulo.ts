// Reconhece no título de uma demanda nova os clientes citados ("Subir criativos PopAgro" → Pop Agro), para a
// demanda já nascer atribuída. Nada reconhecido, ou só nome que serve para mais de um cliente, = sem cliente.
// Regras puras, sem imports do app, para poder testar com `node --test`.

export interface ClienteNome {
  id: string;
  nome: string;
}

// Tratamento e tipo de negócio no começo do nome: "Dra Amuny Gobato" também vale como "Amuny Gobato",
// "Colégio Up One" como "Up One".
const PREFIXOS = new Set(["dr", "dra", "colegio", "grupo", "mentoria"]);

// Palavras comuns demais para apontar um cliente sozinhas. O nome inteiro continua valendo:
// "Super Soft" reconhece, "Super urgente" não.
// ponytail: lista fixa montada com os clientes de 27/10/2026; cliente novo que der falso positivo põe a palavra aqui
// (se isso virar rotina, apelidos por cliente no cadastro).
const GENERICAS = new Set([
  ...PREFIXOS,
  "de", "da", "do", "das", "dos", "e", "em", "a", "o",
  "lab", "laboratorio", "super", "soft", "viral", "prime", "imports", "star", "car", "shop", "easy", "natural",
  "food", "seguros", "engenharia", "multimarcas", "veiculos", "salon", "desempenho", "kids", "wealth", "growth",
  "commerce", "ecommerce", "oracoes", "poderosas", "trabalho", "fe", "radar", "leilao", "fisio", "oral", "up",
  "one", "pop", "agro", "stop", "dias", "campos", "silva", "lima", "breves", "futebol",
]);

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Formas do nome que contam como citação: o nome inteiro, os pedaços separados por " - " ou "/" e o que está entre
 * parênteses ("Ultraclinic Breves (Felipe Pinheiro)" → "felipe pinheiro"), cada um também sem o prefixo e sem
 * espaços ("pop agro" → "popagro"), e cada palavra do nome que não é genérica ("amuny", "frutaria").
 */
function formasDoNome(nome: string): string[] {
  const semParenteses = nome.replace(/\([^)]*\)/g, " ");
  const pedacos = semParenteses.split(/\s+-\s+|\//).map(normalizar);
  const parenteses = [...nome.matchAll(/\(([^)]*)\)/g)].map((m) => normalizar(m[1]));
  const partes = [normalizar(semParenteses)];
  for (const p of [...(pedacos.length > 1 ? pedacos : []), ...parenteses]) {
    // "Virgínia Arruda - E-commerce" não vira citação de "e-commerce"
    if (p && !p.split(" ").every((w) => GENERICAS.has(w))) partes.push(p);
  }
  const formas = new Set<string>();
  for (const p of partes) {
    const palavras = p.split(" ");
    while (palavras.length > 1 && PREFIXOS.has(palavras[0])) palavras.shift();
    for (const f of [p, palavras.join(" ")]) {
      if (f.length < 3) continue;
      formas.add(f);
      formas.add(f.replace(/ /g, ""));
    }
  }
  for (const w of normalizar(nome).split(" ")) if (w.length >= 3 && !GENERICAS.has(w)) formas.add(w);
  return [...formas];
}

/** Ids dos clientes citados no título, na ordem em que aparecem, sem repetir. */
export function clientesNoTitulo(titulo: string, clientes: ClienteNome[]): string[] {
  const donos = new Map<string, Set<string>>();
  for (const c of clientes) {
    for (const f of formasDoNome(c.nome)) {
      if (!donos.has(f)) donos.set(f, new Set());
      donos.get(f)!.add(c.id);
    }
  }
  const texto = ` ${normalizar(titulo)} `;
  const achados: { ini: number; fim: number; id: string }[] = [];
  for (const [forma, ids] of donos) {
    if (ids.size !== 1) continue; // serve para mais de um cliente ("arruda"): não decide
    const [id] = ids;
    for (let i = texto.indexOf(` ${forma} `); i >= 0; i = texto.indexOf(` ${forma} `, i + 1)) {
      achados.push({ ini: i + 1, fim: i + 1 + forma.length, id });
    }
  }
  // A citação mais longa ganha: "Guilherme Garcia" não conta também como "Guilherme" de outro cliente
  achados.sort((a, b) => b.fim - b.ini - (a.fim - a.ini) || a.ini - b.ini);
  const aceitos: typeof achados = [];
  for (const a of achados) if (!aceitos.some((b) => a.ini < b.fim && b.ini < a.fim)) aceitos.push(a);
  aceitos.sort((a, b) => a.ini - b.ini);
  return [...new Set(aceitos.map((a) => a.id))];
}
