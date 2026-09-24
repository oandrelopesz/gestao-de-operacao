# Transcritor — infraestrutura

Tudo gratuito e na VPS (Portainer, Docker Swarm, rede `ALDigitalNet`, Traefik).

```
App (Lovable) ──links──────────────► tabela transcricoes (Supabase) ◄── orquestrador ──► speaches (Whisper)
     └──arquivos em partes (8 MB)──► https://transcritor.minuanoai.com.br (orquestrador, porta 8090)
```

- **speaches**: faster-whisper `large-v3-turbo` (int8, CPU). Só na rede interna, sem porta pública.
- **orquestrador**: a imagem `swipe-worker:latest` com `node src/transcritor/main.js`. Pega a fila da
  tabela, baixa links com yt-dlp (usa os cookies do swipe), converte para áudio mono, corta nos
  silêncios (~5 min por trecho) e transcreve trecho a trecho. O arquivo some assim que a transcrição
  termina. Arquivos esquecidos são apagados depois de 24 h.
- O texto fica no banco até `expira_em`. Um cron (`limpar-transcricoes`) apaga de vez o que venceu.

## Implantação

1. **DNS (Cloudflare)**: registro `A`, nome `transcritor`, valor `2.25.127.182`, **DNS only** (nuvem
   cinza). Com o proxy ligado, a Cloudflare barra uploads acima de 100 MB.
2. **Imagem**: reconstruir `swipe-worker:latest` com o `worker/` atual (a mesma receita do swipe:
   `infra/swipe-worker/README.md`). Depois, atualizar o serviço `swipe_swipe_worker` para ele pegar a
   imagem nova.
3. **Stack**: Portainer > Stacks > Add stack > nome `transcritor` > colar `stack.yml` > Deploy.
4. **Modelo**: ao subir, o orquestrador pede o modelo ao speaches (~1,6 GB). Enquanto isso,
   `https://transcritor.minuanoai.com.br/health` responde `"modelo": "baixando"` e a fila espera.
   Quando mostrar `"pronto"`, já dá para transcrever.

## Operação

- Logs: Portainer > Services > `transcritor_orquestrador` > Logs (linhas JSON: `modelo.*`, `fila.*`,
  `transcricao.*`, `upload.*`).
- Glossário de termos (inglês, siglas, marketing): Admin > Transcritor. Vale a partir da próxima
  transcrição.
- Lento demais? Suba `cpus` e `WHISPER__CPU_THREADS` do speaches juntos (os dois com o mesmo número).
