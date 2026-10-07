import { test } from "node:test";
import assert from "node:assert/strict";
import { REDES, detectarRede, redeLabel } from "./swipeRedes.ts";

test("detectarRede: orgânico x biblioteca de anúncios", () => {
  assert.equal(detectarRede("https://www.facebook.com/ads/library/?id=731247036437259"), "meta_ads");
  assert.equal(detectarRede("https://www.facebook.com/pagina/videos/123"), "facebook");
  assert.equal(detectarRede("https://fb.watch/abc"), "facebook");
  assert.equal(detectarRede("https://www.tiktok.com/@leo/video/7670712654436109588"), "tiktok");
  assert.equal(detectarRede("https://ads.tiktok.com/business/creativecenter/topads/7420/pc/en"), "tiktok_ads");
  assert.equal(detectarRede("https://library.tiktok.com/ads/detail/?ad_id=1"), "tiktok_ads");
  assert.equal(detectarRede("https://adstransparency.google.com/advertiser/AR1/creative/CR2"), "google_ads");
});

test("detectarRede: demais redes e fallback", () => {
  assert.equal(detectarRede("https://www.instagram.com/reel/x/"), "instagram");
  assert.equal(detectarRede("https://youtube.com/shorts/oDCQ8RmdYlA"), "youtube");
  assert.equal(detectarRede("https://youtu.be/abc"), "youtube");
  assert.equal(detectarRede("https://www.linkedin.com/posts/x"), "linkedin");
  assert.equal(detectarRede("https://x.com/a/status/1"), "x");
  assert.equal(detectarRede("https://twitter.com/a/status/1"), "x");
  assert.equal(detectarRede("https://www.threads.net/@a/post/x"), "threads");
  assert.equal(detectarRede("https://www.threads.com/@a/post/x"), "threads");
  assert.equal(detectarRede("https://www.kwai.com/@a/video/1"), "kwai");
  assert.equal(detectarRede("https://br.pinterest.com/pin/1/"), "pinterest");
  assert.equal(detectarRede("https://ibe.ia.br/"), "internet");
  assert.equal(detectarRede("   "), null);
});

test("detectarRede não confunde domínios parecidos (box.com não é x.com)", () => {
  assert.equal(detectarRede("https://box.com/arquivo"), "internet");
  assert.equal(detectarRede("https://netflix.com/x"), "internet");
});

test("REDES: ids únicos, labels legíveis e redeLabel com fallback", () => {
  const ids = REDES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(redeLabel("tiktok_ads"), "TikTok Ads");
  assert.equal(redeLabel("x"), "X"); // vai no nome do arquivo no Drive
  assert.equal(redeLabel("internet"), "Internet");
  assert.equal(redeLabel("inexistente"), "inexistente");
});
