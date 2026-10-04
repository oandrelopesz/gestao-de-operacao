import test from "node:test";
import assert from "node:assert/strict";
import {
  contasDasPaginas, decidir, erroDoContainer, erroMeta, fbAlbum, fbFoto, fbFotoSolta, fbVideo, linkFacebook, paramsCarrossel, paramsFilho,
  paramsUnico, refDaPagina,
} from "../../supabase/functions/instagram/meta.ts";

test("contasDasPaginas: uma conta por Instagram ligado, sem repetir; só página com ponto no mapa vale como lugar", () => {
  const r = contasDasPaginas([
    { id: "p1", name: "Loja A", location: { street: "Rua 1", city: "Brasília", latitude: -15.8, longitude: -47.9 }, instagram_business_account: { id: "ig1", username: "lojaa", name: "Loja A", profile_picture_url: "https://x/a.jpg" } },
    { id: "p2", name: "Página sem Instagram" },
    { id: "p3", name: "Loja A (outra página)", instagram_business_account: { id: "ig1", username: "lojaa" } },
    { id: "p4", name: "Clínica B", location: { street: "Centro", city: "Brasília" }, instagram_business_account: { id: "ig2", username: "clinicab" } },
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
  assert.match(erroMeta({ error: { code: 100, error_user_msg: "A identificação de localização a seguir é inválida" } }, 400), /Escolha outro lugar/);
});

const BASE = { midias: [], legenda: "", local_id: null, reels_no_feed: true, capa_ms: null };
const IMG = { chave: "k", tipo: "imagem" as const, largura: 1080, altura: 1350 };

test("story: STORIES com image_url ou video_url, sem legenda nem local, com marcações", () => {
  const marc = [{ usuario: "ana", x: 0.5, y: 0.25 }];
  assert.deepEqual(paramsUnico({ ...BASE, tipo: "story", legenda: "x", local_id: "9", midias: [{ ...IMG, marcacoes: marc }] }, "https://u/1.jpg"),
    { media_type: "STORIES", image_url: "https://u/1.jpg", user_tags: JSON.stringify([{ username: "ana", x: 0.5, y: 0.25 }]) });
  assert.deepEqual(paramsUnico({ ...BASE, tipo: "story", midias: [{ ...IMG, tipo: "video" }] }, "https://u/v.mp4"),
    { media_type: "STORIES", video_url: "https://u/v.mp4" });
});

test("opções avançadas: texto alternativo, colaboradores, capa e áudio do reels", () => {
  const opcoes = { colaboradores: ["a", "b"], audio_nome: "Som da Kobe" };
  assert.deepEqual(paramsUnico({ ...BASE, tipo: "foto", opcoes, midias: [{ ...IMG, alt_text: "Salão" }] }, "https://u/1.jpg"),
    { image_url: "https://u/1.jpg", alt_text: "Salão", collaborators: JSON.stringify(["a", "b"]) });
  assert.deepEqual(paramsUnico({ ...BASE, tipo: "reels", capa_ms: 900, opcoes, midias: [{ ...IMG, tipo: "video" }] }, "https://u/v.mp4", "https://u/capa.jpg"),
    { media_type: "REELS", video_url: "https://u/v.mp4", share_to_feed: "true", cover_url: "https://u/capa.jpg", audio_name: "Som da Kobe", collaborators: JSON.stringify(["a", "b"]) });
  assert.deepEqual(paramsFilho({ ...IMG, alt_text: "A" }, "https://u/1.jpg"), { image_url: "https://u/1.jpg", is_carousel_item: "true", alt_text: "A" });
  assert.deepEqual(paramsCarrossel({ ...BASE, tipo: "carrossel", opcoes: { colaboradores: ["c"] } }, ["1", "2"]),
    { media_type: "CAROUSEL", children: "1,2", collaborators: JSON.stringify(["c"]) });
});

test("Facebook: foto, foto solta, álbum, vídeo e link", () => {
  const p = { ...BASE, tipo: "foto" as const, legenda: "Oi" };
  assert.deepEqual(fbFoto(p, "https://u/1.jpg"), { url: "https://u/1.jpg", message: "Oi" });
  assert.deepEqual(fbFotoSolta("https://u/1.jpg"), { url: "https://u/1.jpg", published: "false" });
  assert.deepEqual(fbAlbum(p, ["11", "22"]), { message: "Oi", "attached_media[0]": '{"media_fbid":"11"}', "attached_media[1]": '{"media_fbid":"22"}' });
  assert.deepEqual(fbVideo({ ...p, legenda: "" }, "https://u/v.mp4"), { file_url: "https://u/v.mp4" });
  assert.equal(linkFacebook("/kobe/videos/1/"), "https://www.facebook.com/kobe/videos/1/");
  assert.equal(linkFacebook("https://www.facebook.com/1_2"), "https://www.facebook.com/1_2");
  assert.equal(linkFacebook(undefined), null);
});

test("refDaPagina: id, link com nome, profile.php, pages/people e lixo", () => {
  assert.equal(refDaPagina(" 123456789 "), "123456789");
  assert.equal(refDaPagina("https://www.facebook.com/kobegrowth/"), "kobegrowth");
  assert.equal(refDaPagina("facebook.com/profile.php?id=100064"), "100064");
  assert.equal(refDaPagina("https://m.facebook.com/pages/Salao-X/987654321"), "987654321");
  assert.equal(refDaPagina("https://www.facebook.com/people/Ana/61550000000000/"), "61550000000000");
  assert.equal(refDaPagina("https://google.com/maps"), null);
  assert.equal(refDaPagina(""), null);
});
