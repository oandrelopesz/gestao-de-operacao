import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { rodar, ComandoFalhou } from "../src/exec.js";
import { comPastaTemp, listarMidias } from "../src/tmp.js";

test("rodar devolve a saída do comando", async () => {
  const { stdout } = await rodar(process.execPath, ["-e", "process.stdout.write('oi')"]);
  assert.equal(stdout.trim(), "oi");
});

test("rodar lança ComandoFalhou com código e stderr", async () => {
  await assert.rejects(
    () => rodar(process.execPath, ["-e", "process.stderr.write('ruim'); process.exit(3)"]),
    (e) => e instanceof ComandoFalhou && e.code === 3 && e.stderr.includes("ruim"),
  );
});

test("rodar respeita o timeout", async () => {
  await assert.rejects(
    () => rodar(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { timeout: 200 }),
    (e) => e instanceof ComandoFalhou && /tempo/i.test(e.message),
  );
});

test("comPastaTemp apaga a pasta mesmo quando dá erro", async () => {
  let criada;
  await assert.rejects(() => comPastaTemp("teste", async (dir) => { criada = dir; throw new Error("ops"); }));
  await assert.rejects(() => readdir(criada));
});

test("listarMidias devolve só mídia, em ordem natural", async () => {
  const achados = await comPastaTemp("teste", async (dir) => {
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "10.jpg"), "x");
    await writeFile(join(dir, "2.jpg"), "x");
    await writeFile(join(dir, "nota.txt"), "x");
    await writeFile(join(dir, "sub", "3.jpg"), "x");
    return listarMidias(dir);
  });
  assert.deepEqual(achados.map((c) => c.split(/[\\/]/).pop()), ["2.jpg", "3.jpg", "10.jpg"]);
});
