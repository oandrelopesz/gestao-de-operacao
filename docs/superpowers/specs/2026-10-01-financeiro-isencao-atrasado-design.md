# Financeiro: isenção, forma de pagamento, recebimento parcial, atrasado acumulado e histórico

**Data:** 2026-10-01 · **Pedido do André** (aba `/financeiro`): "botão de isentar cliente (apenas para aquele mês) ou
isentar parcela (para quem paga parcelado); forma de pagamento do cliente (PIX, Cartão ou Boleto) e forma de pagamento
por parcela; quando isenta, abona o pagamento daquilo naquele mês e recalcula o previsto e o em aberto; um histórico para
ver o que ficou pendente nos meses anteriores, como um calendário; o atrasado: se ficou algo devido no mês anterior, conta
para o mês seguinte até quitar; no card do cliente um botão de atrasado com o valor e um botão de confirmar recebimento".

**Respostas do André:** a conta do atrasado começa em **setembro de 2026** (junho a agosto não têm registros); histórico
com **as duas visões** (navegar por mês na aba e calendário de 12 meses por cliente); confirmar recebimento com **dois
botões**: "Valor cheio" e "Configurar valor recebido" (valor menor deixa o resto devendo).

## 1. Dados (migration `20261001200000_financeiro_isencao.sql`, só acrescenta)

- `financeiro_fontes.forma_pagamento` text NULL, CHECK `pix | cartao | boleto` (NULL = não informada).
- `financeiro_fontes.cobranca_desde` date NOT NULL: primeiro mês cobrado. As fontes existentes ficam com
  `2026-09-01`; fonte nova, o padrão é o 1º dia do mês atual em Brasília (`date_trunc('month', hoje_brt())`). Editável no
  formulário ("Cobrar a partir de", mês).
- `financeiro_fontes.parcelas` (jsonb que já existe): cada item pode ter `forma` (`pix | cartao | boleto`; ausente = a
  forma da fonte).
- `financeiro_recebimentos.isento` boolean NOT NULL default false; `financeiro_recebimentos.valor_devido` numeric(12,2)
  NULL (valor da parcela congelado quando o André confirma, isenta ou informa um valor). O motivo da isenção vai em
  `observacoes` (já existe).
- `financeiro_view`: mesmas colunas na mesma ordem e, no fim, `forma_pagamento` e `cobranca_desde`; o jsonb
  `recebimentos_mes` ganha `isento` e `valor_devido`.

Um registro por fonte + mês + parcela (chave única que já existe). **Sem registro** = ainda não acertado.

## 2. Regras (puras, `src/lib/financeiroCobranca.ts`, testadas)

- **Meses cobrados:** de `cobranca_desde` até o mês de hoje (Brasília). Antes disso, nada é cobrado ("fora da cobrança").
- **Parcelas de cada mês:** as da configuração atual da fonte (pagamento único = 1 parcela). Valor da parcela no mês =
  `valor_devido` do registro, se houver; num registro antigo recebido, não isento e sem `valor_devido`, o
  `valor_recebido` (a tela antiga gravava ali o valor da parcela); senão, o valor atual. Registro de parcela que não
  existe mais na configuração é ignorado (como hoje).
- **Situação de cada parcela no mês:**
  - `recebido`: pago ≥ valor (pago = `valor_recebido`, ou o valor cheio se o registro está recebido sem valor). Vale
    mesmo com o registro `isento` (o pagamento cobre tudo: nada é abonado).
  - `isento`: o registro diz `isento` e o pago não cobre o valor. O que já tinha sido pago continua contando como
    recebido; o resto é abonado.
  - `parcial`: 0 < pago < valor. Falta = valor − pago.
  - sem pagamento: `a_vencer` / `pendente` / `atrasado` pela regra de hoje (5 dias de tolerância depois do vencimento),
    em qualquer mês: a parcela que venceu no fim do mês anterior ainda é `pendente` nos primeiros dias do mês seguinte.
- **Vencida:** depois do vencimento + 5 dias de tolerância, em qualquer mês. **Atrasado** de uma fonte = soma do que falta
  nas parcelas vencidas de todos os meses cobrados (inclui o resto do parcial).
- **Totais de um mês** (o mês escolhido na aba): previsto = soma dos valores menos o abonado; recebido = soma do pago;
  isento = soma do abonado; em aberto = soma do que falta; atrasado (cartão do topo) = atrasado de todas as fontes até
  hoje, de todos os meses.
- **Mês no calendário:** pior situação das parcelas: devido (atrasado) > parcial > pendente > a vencer; todas isentas =
  isento; recebidas (com ou sem isentas) = recebido; antes de `cobranca_desde` = fora.
- `situacaoDoMes` (usada pelo sino de avisos) passa a tratar parcela isenta como resolvida e parcial como ainda em aberto.
  O sino não avisa fonte com `cobranca_desde` depois do mês atual (fora da cobrança) nem parcela sem nada a receber.

## 3. Ações (gravam em `financeiro_recebimentos`, upsert na chave fonte + mês + parcela)

- **Valor cheio:** `recebido = true`, `valor_recebido = valor`, `valor_devido = valor`, `isento = false`,
  `data_confirmacao = agora`.
- **Configurar valor recebido:** diálogo com o valor recebido **no total** daquela parcela e a data; grava `recebido =
  true`, `valor_recebido = valor informado`, `valor_devido = valor`. Valor ≥ devido quita; menor deixa parcial.
  Valor zero ou vazio não é aceito.
- **Isentar parcela / Isentar este mês / Isentar mês inteiro:** diálogo com motivo opcional; grava `isento = true`,
  `valor_devido = valor`, `observacoes = motivo`, mantendo o que já tinha sido pago. "Mês inteiro" isenta as parcelas
  ainda não quitadas do mês.
- **Desfazer:** apaga o registro da parcela daquele mês (volta a não acertado), com confirmação.

## 4. Tela

- **Formulário da fonte:** "Forma de pagamento" (PIX, Cartão, Boleto, Não informada); "Cobrar a partir de" (mês); no
  parcelado, cada parcela com "Forma" ("Igual ao cliente", PIX, Cartão, Boleto).
- **Card:** selo da forma de pagamento (ícone + texto); botão vermelho **"Atrasado: R$ X"** quando houver atrasado (abre o
  diálogo do atrasado); para o mês escolhido, cada parcela com a situação (texto + cor) e as ações: **"Valor cheio"**,
  **"Configurar valor recebido"**, **"Isentar"** (ou "Isentar parcela"), e **"Desfazer"** quando já acertada; botão
  **"Isentar este mês"** (único) ou **"Isentar mês inteiro"** (parcelado). Parcela do parcelado mostra a forma dela.
- **Diálogo do atrasado:** lista por mês e parcela (mês, parcela, valor, já pago, falta) com "Valor cheio",
  "Configurar valor recebido" e "Isentar"; total no topo.
- **Navegação por mês:** no topo da aba, "‹ outubro de 2026 ›" (de setembro de 2026, ou do `cobranca_desde` mais antigo,
  até o mês atual); os cartões de resumo e os cards mostram o mês escolhido; o mês fica na URL (`?mes=AAAA-MM`). O
  cartão Atrasado é sempre o acumulado até hoje.
- **Detalhe do cliente (Histórico):** calendário dos últimos 12 meses (grade de meses com cor **e** texto: Recebido,
  Parcial, Isento, Devido, Pendente, A vencer, Fora da cobrança) com o valor; clicar num mês mostra as parcelas dele com as
  ações. A lista atual do histórico continua abaixo.
- Filtro de situação da aba considera o mês escolhido (inclui "Isento" e "Parcial").

## 5. Limites conhecidos

- Mês ainda não acertado usa o valor atual da fonte: mudar o valor muda os meses em aberto; os acertados ficam como
  estavam (`valor_devido`).
- Mudar as parcelas (quantidade, dias ou valores, ou trocar entre pagamento único e parcelado) refaz a cobrança dos meses
  que já passaram com as parcelas novas (pode aparecer atraso que não existia). Ao editar a fonte com "Cobrar a partir de"
  antes do mês atual, o formulário avisa e oferece "Cobrar a partir de <mês atual>"; salvar sem isso continua permitido.
- "Cobrar a partir de" no mês atual com o (primeiro) vencimento já passado da tolerância faz o mês começar atrasado; o
  formulário avisa embaixo do campo.
- Fonte desativada não aparece na aba (como hoje), nem o atrasado dela.
- O sino de avisos continua olhando só o mês atual.

## 6. Testes

- `node --test`: regras puras (meses cobrados, situações, parcial, isento com pagamento, totais, atrasado acumulado,
  calendário, `situacaoDoMes` com isento/parcial).
- Tela no servidor local com uma fonte TESTE (única e parcelada): isentar, valor cheio, valor parcial, desfazer, atrasado
  de mês anterior, navegação por mês, calendário, forma de pagamento; apagar a fonte no fim.
- Migration aplicada pelo editor SQL do Lovable (o André autorizou o Claude a operar o navegador), conferida pela API.
