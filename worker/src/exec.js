import { execFile } from "node:child_process";

export class ComandoFalhou extends Error {
  constructor(cmd, code, stderr, mensagem) {
    super(mensagem || `${cmd} terminou com código ${code}`);
    this.name = "ComandoFalhou";
    this.cmd = cmd;
    this.code = code;
    this.stderr = stderr || "";
  }
}

/** execFile com timeout e erro tipado; saída limitada a 10 MB. */
export function rodar(cmd, args, { cwd, timeout = 15 * 60 * 1000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...env } }, (erro, stdout, stderr) => {
      if (!erro) return resolve({ stdout: String(stdout), stderr: String(stderr) });
      // O execFile mata por SIGTERM ao estourar o timeout. Um SIGTERM externo (container sendo
      // parado) cai aqui também, mas nesse caso o processo está morrendo de qualquer jeito.
      if (erro.killed || erro.signal === "SIGTERM") {
        return reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr), `${cmd} estourou o tempo limite`));
      }
      reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr)));
    });
  });
}
