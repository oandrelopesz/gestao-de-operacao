-- Financeiro: recebimentos confirmados antes de 01/10/2026 ganham o valor devido congelado (o valor recebido, que a tela
-- gravava como o valor da parcela). Sem isso, se o valor da fonte subiu depois, um mês já confirmado viraria "parcial".
UPDATE public.financeiro_recebimentos
   SET valor_devido = valor_recebido
 WHERE recebido = true AND isento = false AND valor_devido IS NULL AND valor_recebido IS NOT NULL;
