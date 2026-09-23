# Onboarding + Roadmap — Design

Data: 23/09/2026. Aprovado em conversa com o usuário (Partes 1, 2 e 3 do desenho; "execute todas as últimas demandas").

## Objetivo

Duas abas novas no grupo **Operação** do menu lateral, logo abaixo de Demandas:

- **Onboarding** — acompanha a entrada de cada cliente marcado "Em onboarding": uma trilha horizontal de passos (vindos de um template ou criados do zero), com datas opcionais, porcentagem, previsão de término e verba mensal. Ao concluir 100%, o cliente sai do onboarding e passa a ter tráfego ativo.
- **Roadmap** — acompanha tarefas complexas e de longo prazo de um cliente (ex.: landing page: copy, design, trackeamento, domínio, hospedagem) com a mesma trilha. Pode ser ligado a um passo do onboarding.

Os passos do **onboarding** com data próxima viram demandas no Kanban (colunas Fazer hoje / amanhã / depois de amanhã), sincronizados nos dois sentidos. Passos de roadmap **nunca** vão para Demandas.

## Decisões do usuário (literais)

1. Templates ilimitados, criados pelo usuário; nenhum template pré-definido. Criar template = dar um nome + adicionar passos ("Demanda 1", "Demanda 2"…) renomeáveis. Templates não têm datas. Todos os templates podem ser renomeados.
2. Aplicar um template existente a um cliente, ou começar do zero. Um processo sem template fica "Personalizado" e pode ser salvo como template.
3. Os passos do processo podem ser editados, adicionados, excluídos e reordenados (arrastar e soltar) a qualquer momento, nas duas abas.
4. Datas: opcionais nas duas abas, mas sempre recomendadas. Passo sem data vai para o **fim** da trilha.
5. O card do cliente em onboarding tem a verba mensal que ele vai usar. Ao concluir o onboarding o cliente vira "tráfego ativo" e a verba passa a valer.
6. Ficam registrados o dia em que o cliente entrou no onboarding e o dia em que concluiu; há um histórico.
7. Visual: trilha **horizontal** que avança conforme os passos são concluídos, com porcentagem e data prevista de término. "Bem intuitivo e bem bonito."
8. Reordenar passos cujas datas ficariam invertidas abre um popup listando os passos trocados para escolher uma nova data para cada um.
9. Roadmap: escolher o cliente (filtro "em onboarding" ou "em andamento"); data final de conclusão opcional; datas dos passos opcionais. Quando o roadmap está ligado a um passo do onboarding, o prazo do roadmap passa a ser automaticamente a data daquele passo.
10. Nada do roadmap vai para Demandas. Só passos do onboarding vão. Se o passo do onboarding está ligado a um roadmap, o card vai com a tag **Roadmap**, e clicar nele leva para a aba Roadmap naquele roadmap. Na aba Onboarding também dá para clicar no passo e ir para o roadmap.
11. Roadmap segue a mesma lógica de conclusão: passo concluído fica verde; roadmap 100% sai de "Em andamento" e vai para o Histórico.
12. Cards de onboarding em Demandas: tag **Onboarding** bem visível; observações do passo vão no card junto com a tag de observação; passo não cumprido no prazo e sem data alterada = card **vermelho** "atrasado" (na medida do atraso).
13. Passos podem ser concluídos antes do prazo, a qualquer momento; concluídos antes de entrarem na janela nunca viram demanda.
14. Mover o card de um passo no Kanban atualiza o passo (tabela em "Sincronização").

## Arquitetura

**Um motor para as duas abas** (abordagem A aprovada): mesmas tabelas com campo `tipo` ('onboarding' | 'roadmap'), mesmos componentes de trilha/template/histórico; diferenças são regras.

### Dados (migration nova)

```
processo_templates        id, tipo, nome, created_at, updated_at
processo_template_passos  id, template_id → processo_templates ON DELETE CASCADE,
                          titulo, observacoes, ordem
processos                 id, tipo, cliente_id → clientes ON DELETE CASCADE,
                          nome, template_id → processo_templates ON DELETE SET NULL (null = Personalizado),
                          status 'ativo' | 'concluido' | 'encerrado',
                          iniciado_em timestamptz, concluido_em timestamptz,
                          prazo_final date (roadmap),
                          passo_onboarding_id → processo_passos ON DELETE SET NULL (roadmap ligado),
                          created_at, updated_at
processo_passos           id, processo_id → processos ON DELETE CASCADE,
                          titulo, observacoes, data date null, ordem int,
                          concluido_em timestamptz null,
                          created_at, updated_at
demandas (+)              processo_passo_id uuid UNIQUE → processo_passos ON DELETE SET NULL
                          roadmap_id uuid → processos ON DELETE SET NULL   (para a tag e o link)
clientes (+)              onboarding_desde timestamptz
```

- RLS: policy `FOR ALL USING (true) WITH CHECK (true)` em todas as tabelas novas (padrão do projeto; app usa usuário padrão).
- Um cliente tem no máximo **um** processo de onboarding `ativo` (índice único parcial).
- `clientes.onboarding_desde` é gravado por trigger quando `em_onboarding` passa para true (e limpo quando volta a false depois de concluído/encerrado).
- Verba: o card de onboarding edita a verba real do cliente na **operação principal** (tabela `operacoes`, `plataformas_config[plataforma].verba`, `tipo_verba = 'mensal'`), com seletor de plataforma (lista de `src/lib/plataformas.tsx`) e link "Editar no cadastro" para configurações com várias plataformas/operações. Enquanto o cliente está em onboarding, `trafego_ativo = false` e a verba não entra nos totais; ao concluir, `trafego_ativo = true`.

### Regras de negócio (lógica pura, testável — `src/lib/processos.ts`)

- **Ordem da trilha**: passos ordenados por `ordem`; passos sem data sempre depois dos que têm data (ao salvar, a ordem é normalizada assim).
- **Progresso**: concluídos / total (0 passos = 0%).
- **Previsão de término** (onboarding): maior data entre os passos (ignora sem data); roadmap mostra `prazo_final`.
- **Atraso**: passo não concluído com `data < hoje` (datas em horário de Brasília).
- **Datas invertidas**: após reordenar, se a sequência de passos **com data** não é não-decrescente, calcular os passos envolvidos (o movido + os que ele ultrapassou) → popup. Passo sem data arrastado para antes de passos datados também abre o popup pedindo data. Popup: um campo de data por passo (pré-preenchido), Salvar habilitado só quando a ordem fica válida; Cancelar desfaz a reordenação.
- **Coluna → data**: hoje/amanhã/depois de amanhã = hoje+0/+1/+2; fim de semana = próximo sábado/domingo **a partir de hoje** (se hoje já é o dia escolhido, é hoje); standby ou coluna personalizada = sem data (vai para o fim); feito = concluir.

### Sincronização (no banco — funções + triggers)

**Onboarding → Demandas** — `sincronizar_passos(p_passo uuid default null)`; roda por trigger após insert/update/delete em `processo_passos` e mudanças relevantes em `processos`, e diariamente logo após a virada (cron 03:01 UTC). Para cada passo de processo `tipo='onboarding'` e `status='ativo'`:

| Situação | Ação |
|---|---|
| data ≤ hoje+2, não concluído, sem demanda | cria demanda: status pela data (≤ hoje → fazer_hoje), titulo "Passo — Cliente", descricao = observações, cliente_id, prazo = data, processo_passo_id, roadmap_id (se ligado), ordem no fim da coluna |
| tem demanda em fazer_hoje/amanha/depois e a data mudou | move para a coluna da nova data (ou apaga a demanda se a data saiu da janela / foi limpa **pela aba Onboarding**) |
| concluído e demanda fora de feito | demanda → feito |
| título/observações mudaram | atualiza titulo/descricao da demanda |
| passo excluído, ou processo encerrado | demanda aberta (não feito) é apagada |

Nunca mexe em demandas em fim de semana, standby ou coluna personalizada (exceto concluir/excluir).

**Demandas → Onboarding** — trigger em `demandas` AFTER UPDATE OF status (quando muda) com `processo_passo_id`:

| Nova coluna | Passo |
|---|---|
| fazer_hoje / fazer_amanha / fazer_depois_amanha | data = hoje / +1 / +2 (Brasília) |
| fazer_fim_de_semana | data = próximo sábado/domingo conforme `dia_fim_de_semana` (também quando só o dia muda) |
| feito | concluido_em = now() |
| saiu de feito | concluido_em = null |
| standby / personalizada | data = null, ordem = fim |

- A virada da meia-noite muda o status mas a data resultante é a mesma (não há efeito colateral). Reordenar na mesma coluna não altera datas.
- Anti-loop: as duas direções usam `pg_trigger_depth()` / flag de sessão para não se reativarem.
- Excluir a demanda no Kanban só desfaz o vínculo (FK SET NULL); a sincronização recria quando o passo estiver na janela e aberto.

**Roadmap ↔ passo do onboarding**
- `processos.prazo_final` (roadmap ligado) = `processo_passos.data` do passo ligado, nos dois sentidos (trigger).
- Roadmap chega a 100% → status 'concluido', concluido_em; passo ligado → concluído (e a demanda dele vai para feito). Concluir o passo manualmente com o roadmap incompleto é permitido (a tela avisa).
- Passos do roadmap nunca geram demandas.

**Entrada/saída do cliente**
- `em_onboarding` true → cliente aparece em Onboarding › Em andamento (com processo ou com o estado vazio "Usar template / Começar do zero"). `processos.iniciado_em` = `clientes.onboarding_desde`.
- Todos os passos concluídos (pela aba ou pelo Kanban) → o card mostra "Pronto para concluir". Confirmar (popup com a verba editável) → `em_onboarding=false`, `trafego_ativo=true`, processo `concluido`, `concluido_em=now()`, vai para o Histórico.
- `em_onboarding` desmarcado com processo ativo → processo `encerrado` (Histórico "Encerrado sem concluir"), demandas abertas dele saem do quadro.

## Telas

Rotas `/onboarding` e `/roadmap` (`src/routes/_authenticated/`), cada uma com abas no topo **Em andamento · Templates · Histórico**. Componentes compartilhados em `src/components/processos/`.

- **Card do processo** (largo, um por linha): nome do cliente, nome do processo/template ("Personalizado"), entrou em, % + barra, previsão (onboarding) ou prazo final (roadmap), contador de atrasados; onboarding mostra a verba (editável inline); menu ⋯ (aplicar template — substituir se nada concluído ou acrescentar ao fim —, salvar como template, renomear, criar roadmap para este cliente [onboarding], ligar a um passo do onboarding [roadmap], encerrar sem concluir).
- **Trilha horizontal**: nós conectados; ✔ verde concluído, ● próximo, vermelho atrasado, ○ pendente; título e data abaixo; trecho tracejado com os sem data no fim; clique no círculo conclui/desfaz; clique no título abre painel lateral (título, data, observações, link do roadmap com %, excluir); arrastar e soltar reordena (dnd-kit horizontal) com o popup de datas invertidas; "+ passo" no fim; rolagem horizontal quando não cabe.
- **Estado vazio** do cliente em onboarding sem processo: "Usar template" (lista) / "Começar do zero".
- **Templates**: grade de cards (nome, nº de passos); "Criar template" abre editor (nome obrigatório, passos com título + observações, reordenar arrastando, excluir passo); renomear, editar, duplicar, excluir (processos já criados não são afetados).
- **Histórico**: tabela (cliente, processo/template, início, conclusão, duração em dias, nº de passos, situação concluído/encerrado), busca por cliente, filtro de período; clique abre a trilha em somente leitura.
- **Roadmap › Novo roadmap**: cliente (filtro Em onboarding / Em andamento), nome, template ou do zero, prazo final opcional, passo do onboarding a ligar (opcional, só passos do onboarding ativo daquele cliente).
- **Kanban (Demandas)**: tags "Onboarding" (clicável → /onboarding com o cliente em foco) e "Roadmap" (card inteiro clicável → /roadmap?id=…; "Detalhes" continua no menu ⋯); card vermelho com "Atrasado há N dias" quando `prazo < hoje` e status ≠ feito e é passo de onboarding.
- **Aba Clientes**: nada muda além de o selo "Onboarding" continuar; marcar "Em onboarding" no cadastro é a porta de entrada.

## Erros

- Falhas de gravação: toast + recarregar (padrão do app).
- Sincronização idempotente (vínculo único passo ↔ demanda).
- Migrations aplicadas pelo SQL editor do Lovable; testes de SQL em blocos que terminam com `RAISE EXCEPTION` (tudo desfeito).

## Testes

- `npm test` (node --test) para `src/lib/processos.ts`: ordenação com sem data no fim, progresso, previsão, atraso, detecção de datas invertidas, coluna → data (incluindo próximo sábado/domingo e "hoje é sábado").
- SQL: criação da demanda na janela, fora da janela, conclusão nos dois sentidos, mover coluna → data, fim de semana → sábado/domingo, standby → sem data, roadmap 100% → passo concluído, prazo sincronizado, encerrar processo, sem duplicação ao rodar duas vezes.
- Navegador: roteiro final cobrindo criar template, aplicar, datar, ver a demanda no Kanban, mover, concluir, concluir onboarding (tráfego ativo), roadmap ligado.

## Fora do escopo

- Migrar hospedagem para a Vercel (pergunta separada; recomendação registrada na conversa).
- Notificações/WhatsApp para passos.

---

# Adendo (23/09/2026) — entrega, colunas por regra de data e Admin por aba

Aprovado pelo usuário ("pode executar tudo"). Executado em três planos, nesta ordem: **A** (Demandas: entrega + colunas), **B** (Onboarding + Roadmap, este documento acima), **C** (Admin por aba + menu).

## A. Demandas: data de entrega e colunas com regra de data

- Toda demanda tem **Entrega** (`demandas.prazo`, já existe). O painel do card ganha o campo com calendário (e limpar). O card mostra "Entrega dd/MM"; vermelho com "Atrasada há N dias" quando `prazo < hoje` e a demanda não está em Feito.
- Toda demanda com cliente mostra a **tag do cliente** no card (feito em 4645c29). Demandas vindas do onboarding sempre levam o cliente.
- Cada coluna tem uma **regra de data** (`demanda_colunas.regra_data`): `nenhuma` · `hoje` · `amanha` · `depois_amanha` · `dias_semana` (+ `dias_semana smallint[]`, 0 = domingo … 6 = sábado, na ordem em que as seções aparecem).
  - Fazer hoje/amanhã/depois de amanhã = hoje/amanha/depois_amanha; Fazer no fim de semana = dias_semana {6,0}; demais = nenhuma.
  - Mover um card **para** uma coluna com regra (pelo quadro, pelo painel ou pelo formulário) grava a entrega: hoje+0/+1/+2, ou o próximo dia escolhido (hoje, se hoje já é o dia). Colunas sem regra mantêm a entrega.
  - A virada da meia-noite e a sincronização do onboarding **não** recalculam a entrega (flag de sessão), então a data de um card continua a mesma quando ele muda de coluna sozinho.
- **Colunas "por dias da semana"** generalizam a do fim de semana: qualquer coluna (sistema ou criada pelo usuário) pode ter dias; ela se divide em uma seção por dia, entrar nela vindo de outra coluna abre o popup de escolha do dia, o card mostra o dia e o menu ⋯ troca o dia. `demandas.dia_fim_de_semana` vira `demandas.dia_semana smallint` (sabado→6, domingo→0).
- Criar/editar coluna (no quadro e no Admin) tem: nome, cor, regra de data e, se "Dias da semana", os dias marcados.
- A virada pode ser ligada/desligada no Admin (`app_config.virada_ativa`, padrão ligada).

Sincronização do onboarding (seção acima) passa a usar a entrega: passo.data ⇄ demanda.prazo. Card do passo em coluna sem regra (Standby, personalizada sem regra) → passo sem data (fim da trilha) e entrega vazia.

## C. Admin por aba e menu lateral

`app_config (chave text PK, valor jsonb)` guarda configurações simples. A página Admin passa a ter abas no topo:

- **Geral**: Menu lateral (mostrar/ocultar cada aba e mudar a ordem; Admin sempre visível), Agências, Plataformas de ads, Aparência, Dados, Zona de perigo.
- **Demandas**: Colunas (nome, cor, regra de data, dias, ordem, excluir) e "Virada automática à meia-noite" liga/desliga.
- **Onboarding**: templates de onboarding (mesmo editor da aba), "Enviar passos para Demandas com até N dias de antecedência" (0–2, padrão 2 = até depois de amanhã), "Ativar tráfego automaticamente ao concluir" (padrão ligado).
- **Roadmap**: templates de roadmap.
- **PDFs**: pastas (card atual) e tamanho máximo por arquivo em MB.
- **Ver depois**: tipos de link (nome e cor; criar, renomear, reordenar, excluir — itens de um tipo excluído viram "Outro link"). Tabela `ver_depois_tipos`; a CHECK fixa de `ver_depois.tipo` sai.
- **Livros**: meta de livros lidos por ano (mostrada na aba Livros com o progresso do ano).
- **Cursos**, **Swipe file**, **Habilidades**: os cards que já existem, cada um na sua aba.

Ruling: para Livros não há "status" configuráveis (o modelo é lido/em andamento); a configuração útil é a meta anual.
