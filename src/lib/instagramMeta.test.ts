import test from "node:test";
import assert from "node:assert/strict";
import { contasDasPaginas, decidir, erroDoContainer, erroMeta, paramsCarrossel, paramsFilho, paramsUnico } from "../../supabase/functions/instagram/meta.ts";

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

test("paramsUnico/paramsFilho/paramsCarrossel: legenda e local só quando há; reels com feed e capa", () => {
  const base = { midias: [], legenda: "", local_id: null, reels_no_feed: true, capa_ms: null };
  assert.deepEqual(paramsUnico({ ...base, tipo: "foto" }, "https://u/1.jpg"), { image_url: "https://u/1.jpg" });
  assert.deepEqual(paramsUnico({ ...base, tipo: "reels", legenda: "oi", local_id: "77", reels_no_feed: false, capa_ms: 1500 }, "https://u/v.mp4"),
    { caption: "oi", location_id: "77", media_type: "REELS", video_url: "https://u/v.mp4", share_to_feed: "false", thumb_offset: "1500" });
  assert.deepEqual(paramsFilho({ chave: "k", tipo: "video", largura: 1, altura: 1 }, "https://u/v.mp4"), { media_type: "VIDEO", video_url: "https://u/v.mp4", is_carousel_item: "true" });
  assert.deepEqual(paramsFilho({ chave: "k", tipo: "imagem", largura: 1, altura: 1 }, "https://u/1.jpg"), { image_url: "https://u/1.jpg", is_carousel_item: "true" });
  assert.deepEqual(paramsCarrossel({ ...base, tipo: "carrossel", legenda: "L" }, ["a", "b"]), { caption: "L", media_type: "CAROUSEL", children: "a,b" });
});

test("decidir: erro primeiro, espera filhos, cria o carrossel, espera o principal, publica", () => {
  const F = { status_code: "FINISHED" }, P = { status_code: "IN_PROGRESS" };
  assert.equal(decidir([F, { status_code: "ERROR", status: "Error: ... 2207026" }], null).acao, "erro");
  assert.deepEqual(decidir([F, P], null), { acao: "esperar" });
  assert.deepEqual(decidir([F, F], null), { acao: "criar_carrossel" });
  assert.deepEqual(decidir([F, F], P), { acao: "esperar" });
  assert.deepEqual(decidir([], F), { acao: "publicar" });
  assert.match(erroDoContainer({ status_code: "ERROR", status: "Error: Media upload has failed with error code 2207026" }), /MP4 ou MOV/);
  assert.match(erroDoContainer({ status_code: "EXPIRED" }), /expirou/);
  assert.match(erroMeta({ error: { code: 9, error_subcode: 2207042, message: "x" } }, 400), /limite diário/);
});
