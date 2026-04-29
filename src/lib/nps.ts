export interface NPSMetric {
  id: string;
  label: string;
  description: string;
  criteria: {
    verde: string;
    neutro: string;
    amarelo: string;
    vermelho: string;
  };
}

export const NPS_METRICS: NPSMetric[] = [
  {
    id: "engajamento",
    label: "Engajamento e responsividade",
    description: "Frequência e clareza na comunicação e aprovações.",
    criteria: {
      verde: "8-10: Aprova material em até 24h, feedback claro, comparece em reunião, responde no mesmo dia.",
      neutro: "6-7: Aprova em 2-3 dias, feedback genérico, reunião só quando marca.",
      amarelo: "4-5: Aprova em 4-7 dias, ignora mensagem 1-2 vezes, feedback raso, reunião remarcada.",
      vermelho: "0-3: Some por mais de 7 dias, deixa criativo parado, falta em reunião, só responde quando cobrado."
    }
  },
  {
    id: "resultados_campanha",
    label: "Resultados de campanha",
    description: "Performance das campanhas em relação às metas (CPA, ROAS).",
    criteria: {
      verde: "8-10: Bate meta, CPA dentro ou abaixo do alvo, ROAS positivo, tendência de melhora.",
      neutro: "6-7: Entrega 80-95% da meta, oscilação leve, sem crise nem destaque.",
      amarelo: "4-5: Abaixo da meta por 2 meses, CPA subindo, criativo fadigado sem renovação.",
      vermelho: "0-3: 3+ meses fora da meta, ROAS negativo, conta em loop de teste sem direção."
    }
  },
  {
    id: "conversao_vendas",
    label: "Conversão (vendas do cliente)",
    description: "Como o comercial do cliente lida com os leads gerados.",
    criteria: {
      verde: "8-10: Lead virando venda em taxa saudável, faturamento crescendo, comercial dele responsivo.",
      neutro: "6-7: Conversão estável sem crescimento, comercial mediano, leads em ritmo morno.",
      amarelo: "4-5: Leads bons chegam e não fecham, comercial demora, taxa caindo.",
      vermelho: "0-3: Lead chega e morre, faturamento em queda, cliente culpando o lead."
    }
  },
  {
    id: "relacionamento",
    label: "Relacionamento",
    description: "Confiança, parceria e tratamento direto com a agência.",
    criteria: {
      verde: "8-10: Confia nas decisões, trata como parceiro, aceita teste estratégico, indica outros.",
      neutro: "6-7: Cordial mas distante, aprova sem questionar nem elogiar, relação operacional.",
      amarelo: "4-5: Questiona toda decisão, tom seco no WhatsApp, compara com concorrente.",
      vermelho: "0-3: Ríspido, atribui resultado ruim só à agência, fala em rever parceria."
    }
  },
  {
    id: "potencial_crescimento",
    label: "Potencial de crescimento",
    description: "Saúde financeira do negócio e abertura para novos investimentos.",
    criteria: {
      verde: "8-10: Budget escalável, aberto a novos canais, permite upsell, dá indicação.",
      neutro: "6-7: Budget estável, aceita sugestão mas não puxa, não indica.",
      amarelo: "4-5: Budget travado ou em redução, recusa novos canais, negócio estagnado.",
      vermelho: "0-3: Corta budget, fala em pausar, negócio em crise, sem capital pra investir."
    }
  }
];

export interface NPSScoreCategory {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  action: string;
  description: string;
}

export const NPS_SCORE_CATEGORIES: NPSScoreCategory[] = [
  {
    id: "ancora",
    label: "Cliente âncora",
    min: 40,
    max: 50,
    color: "bg-emerald-700 text-white",
    action: "Blindar, pedir case e indicação, oferecer upsell.",
    description: "Extremamente satisfeito e engajado."
  },
  {
    id: "saudavel",
    label: "Cliente saudável",
    min: 30,
    max: 39,
    color: "bg-emerald-500 text-white",
    action: "Manter padrão, monitorar mensalmente.",
    description: "Satisfeito com os resultados."
  },
  {
    id: "em_risco",
    label: "Cliente em risco",
    min: 20,
    max: 29,
    color: "bg-amber-500 text-white",
    action: "Reunião estratégica, replanejar, alinhar expectativa.",
    description: "Sinais de alerta detectados."
  },
  {
    id: "critico",
    label: "Cliente crítico",
    min: 0,
    max: 19,
    color: "bg-red-500 text-white",
    action: "Plano de recuperação em 30 dias ou decisão de saída.",
    description: "Alto risco de churn."
  }
];

export function getScoreCategory(score: number): NPSScoreCategory {
  return NPS_SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max) || NPS_SCORE_CATEGORIES[3];
}

export function getMetricColor(nota: number): string {
  if (nota >= 8) return "bg-emerald-500";
  if (nota >= 6) return "bg-slate-400";
  if (nota >= 4) return "bg-amber-500";
  return "bg-red-500";
}

export function getMetricLabel(nota: number): string {
  if (nota >= 8) return "Saudável";
  if (nota >= 6) return "Estável";
  if (nota >= 4) return "Alerta";
  return "Risco";
}

export function isFridayToday(): boolean {
  // Garantir que a verificação use o fuso horário de Brasília (UTC-3)
  const brt = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(brt).getDay() === 5;
}

export function getDiasAteProximaSexta(): number {
  const brt = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const today = new Date(brt);
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 5) return 0;
  if (dayOfWeek === 6) return 6; // sábado → 6 dias
  return 5 - dayOfWeek; // dom=5, seg=4, ter=3, qua=2, qui=1
}

export function getProximaSextaFormatada(): string {
  const dias = getDiasAteProximaSexta();
  const brt = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const proxima = new Date(brt);
  proxima.setDate(proxima.getDate() + dias);
  return proxima.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
