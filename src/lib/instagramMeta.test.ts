import test from "node:test";
import assert from "node:assert/strict";
import { contasDasPaginas, erroMeta } from "../../supabase/functions/instagram/meta.ts";

test("contasDasPaginas: uma conta por Instagram ligado, sem repetir; página sem Instagram fica de fora", () => {
  const r = contasDasPaginas([
    { id: "p1", name: "Loja A", location: { street: "Rua 1", city: "Brasília" }, instagram_business_account: { id: "ig1", username: "lojaa", name: "Loja A", profile_picture_url: "https://x/a.jpg" } },
    { id: "p2", name: "Página sem Instagram" },
    { id: "p3", name: "Loja A (outra página)", instagram_business_account: { id: "ig1", username: "lojaa" } },
    { id: "p4", name: "Clínica B", location: null, instagram_business_account: { id: "ig2", username: "clinicab" } },
  ]);
  assert.deepEqual(r, [
    { id: "ig1", usuario: "lojaa", nome: "Loja A", foto_url: "https://x/a.jpg", pagina_id: "p1", pagina_tem_local: true },
    { id: "ig2", usuario: "clinicab", nome: "Clínica B", foto_url: null, pagina_id: "p4", pagina_tem_local: false },
  ]);
});

test("erroMeta: token inválido, sem permissão e erro genérico em português", () => {
  assert.match(erroMeta({ error: { code: 190, message: "x" } }, 400), /META_TOKEN/);
  assert.match(erroMeta({ error: { code: 200, message: "Requires pages_show_list" } }, 403), /^Sem permissão na Meta: Requires pages_show_list$/);
  assert.equal(erroMeta({ error: { code: 1, message: "Falhou" } }, 500), "Meta: Falhou (código 1)");
  assert.equal(erroMeta(null, 502), "A Meta respondeu 502.");
});
