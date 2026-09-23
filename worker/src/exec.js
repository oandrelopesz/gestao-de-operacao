import { execFile } from "node:child_process";
import { registrar, paradaPedida, JobPausado } from "./parada.js";

export class ComandoFalhou extends Error {
  constructor(cmd, code, stderr, mensagem) {
    super(mensagem || `${cmd} terminou com código ${code}`);
    this.name = "ComandoFalhou";
    this.cmd = cmd;
    this.code = code;
    this.stderr = stderr || "";
  }
}

/**
 * execFile com timeout e erro tipado; saída limitada a 10 MB. Se o usuário pausar o job, o
 * processo é morto e a promessa rejeita com JobPausado (não conta como falha do comando).
 */
export function rodar(cmd, args, { cwd, timeout = 15 * 60 * 1000, env } = {}) {
  if (paradaPedida()) return Promise.reject(new JobPausado());
  return new Promise((resolve, reject) => {
    // `detached` põe o comando num grupo de processos próprio: a pausa mata o grupo inteiro
    // (yt-dlp chama ffmpeg; single-file abre o Chromium), sem deixar filho órfão escrevendo no disco.
    const opcoes = { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...env }, detached: process.platform !== "win32" };
    const filho = execFile(cmd, args, opcoes, (erro, stdout, stderr) => {
      soltar();
      if (paradaPedida()) return reject(new JobPausado());
      if (!erro) return resolve({ stdout: String(stdout), stderr: String(stderr) });
      // O execFile mata por SIGTERM ao estourar o timeout. Um SIGTERM externo (container sendo
      // parado) cai aqui também, mas nesse caso o processo está morrendo de qualquer jeito.
      if (erro.killed || erro.signal === "SIGTERM") {
        return reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr), `${cmd} estourou o tempo limite`));
      }
      reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr)));
    });
    const soltar = registrar(() => {
      try {
        if (opcoes.detached && filho.pid) process.kill(-filho.pid, "SIGKILL");
        else filho.kill("SIGKILL");
      } catch {
        filho.kill("SIGKILL");
      }
    });
  });
}
