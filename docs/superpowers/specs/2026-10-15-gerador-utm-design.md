# Gerador de UTM (Ferramentas)

Data: 2026-10-15. Pedido do André: aba "Gerador de UTM" em Ferramentas, com UTMs prontas para colar em cada plataforma, por cliente, com guardar e painel de guardadas. Base: planilha "Utm Builder - Template" (aba oculta Config).

## O que vem da planilha

- Config por plataforma: source e medium padrão, variáveis dinâmicas (campanha, conjunto, anúncio, posicionamento, dispositivo, rede, click id) e modelos de utm_campaign, utm_content e utm_term.
- Regras: e-mail vira `nl_AAAAMMDD_campanha` e `assunto_...`; Google Ads também sai como modelo `{lpurl}?...`; link final usa `?` ou `&` conforme a URL; tudo em minúsculas com `_`; erros de URL e de UTM faltando.
- Dropdowns da planilha (plataforma, source, medium) viram os dropdowns da aba, agora todos com explicação.

## Decisões

- **Sem banco para o catálogo.** Canais, variáveis e explicações ficam em código (`src/lib/utmCanais.ts`), porque mudam com a documentação das plataformas, não com o uso.
- **Variáveis só as oficiais**, conferidas nas páginas das plataformas em 15/10/2026 (Meta, Google Ads, TikTok, Pinterest, LinkedIn, Taboola, Outbrain, ChatGPT Ads). X não tem variáveis: campos fixos.
- **Onde a plataforma não tem nome** (Google: só IDs; ChatGPT Ads: só IDs), o nome da campanha é digitado e os IDs vão em utm_id e parâmetros extras.
- **Mapeamento fixo:** campanha → utm_campaign, conjunto/grupo → utm_term, anúncio → utm_content (no Google, utm_term leva a palavra-chave e o grupo vai por ID). Cada canal permite trocar por dropdown.
- **Saída por canal:** "parâmetros para colar na plataforma" (sem `?`), "link completo" e, no Google, o modelo de acompanhamento. Cada um com botão copiar e a dica de onde colar.
- **Limpeza automática:** valores digitados viram minúsculos, sem acento e com `_`; variáveis nunca são codificadas; UTM antiga no link é trocada (com aviso); `?x=1` e `#âncora` são preservados.
- **Guardar:** tabela `utms` (por cliente, `ON DELETE CASCADE`, única por cliente + link final). Subaba "Guardadas" lista só clientes que têm UTM; dentro: copiar, excluir, "Gerar mais" e "Adicionar existente" (cola um link com UTM, o sistema lê os campos).
- **Testes:** `src/lib/utm.test.ts` cobre limpeza, montagem por canal, link com query e hash, leitura de link e consistência do catálogo.

## Fora do escopo

Histórico de edição, favoritos, modelos de nome por cliente, encurtador de link, leitura automática da Meta (regra do projeto: nunca acessar a Meta).
