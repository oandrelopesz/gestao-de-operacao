import test from "node:test";
import assert from "node:assert/strict";
import {
  acaoPendente, corpoConvidar, corpoMoverEvento, corpoNovoEvento, enviaConvite, linkMeetDoEvento, mesclarConvidados, tituloReuniao,
} from "./crmAgenda.ts";
import { leadBase } from "./crmTipos.ts";

const em = "2026-10-01T16:00:00.000Z";

test("título com e sem empresa", () => {
  assert.equal(tituloReuniao({ nome: "Ana Souza", empresa: null }), "Reunião — Ana Souza · André Lopes");
  assert.equal(tituloReuniao({ nome: "Ana", empresa: "Loja X" }), "Reunião — Ana (Loja X) · André Lopes");
});

test("evento novo com e-mail: convidado, Meet, notificações 60/30/10 e vínculo com o lead", () => {
  const lead = leadBase({ id: "abc", nome: "Ana", email: "Ana@Empresa.com", reuniao_em: em, reuniao_duracao_min: 45 });
  const c = corpoNovoEvento(lead, "req-1");
  assert.deepEqual(c.attendees, [{ email: "ana@empresa.com" }]);
  assert.equal(c.start?.dateTime, em);
  assert.equal(c.end?.dateTime, "2026-10-01T16:45:00.000Z");
  assert.equal(c.start?.timeZone, "America/Sao_Paulo");
  assert.deepEqual(c.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 30 }, { method: "popup", minutes: 10 }] });
  assert.equal(c.conferenceData?.createRequest.requestId, "req-1");
  assert.equal(c.conferenceData?.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.deepEqual(c.extendedProperties, { private: { crm_lead_id: "abc" } });
  assert.doesNotMatch(c.description ?? "", /Ana/);
  assert.equal(enviaConvite(lead), true);
});

test("evento novo sem e-mail: sem convidado e sem envio", () => {
  const lead = leadBase({ reuniao_em: em, email: null });
  assert.equal(corpoNovoEvento(lead, "r").attendees, undefined);
  assert.equal(enviaConvite(lead), false);
  assert.equal(enviaConvite(leadBase({ email: "invalido" })), false);
});

test("mesclar convidados troca o e-mail antigo e mantém os outros", () => {
  const atuais = [{ email: "contato@andrelopes.digital", self: true }, { email: "velho@x.com" }, { email: "socio@x.com" }];
  assert.deepEqual(mesclarConvidados("novo@x.com", atuais, "velho@x.com"), [{ email: "socio@x.com" }, { email: "novo@x.com" }]);
  assert.deepEqual(mesclarConvidados(null, atuais, "velho@x.com"), [{ email: "socio@x.com" }]);
  assert.deepEqual(mesclarConvidados("SOCIO@x.com", atuais, null), [{ email: "velho@x.com" }, { email: "socio@x.com" }]);
});

test("mover e convidar", () => {
  const lead = leadBase({ reuniao_em: em, reuniao_duracao_min: 30, email: "a@b.com" });
  const mov = corpoMoverEvento(lead, [], null);
  assert.equal(mov.end?.dateTime, "2026-10-01T16:30:00.000Z");
  assert.deepEqual(mov.attendees, [{ email: "a@b.com" }]);
  assert.deepEqual(corpoConvidar(lead, [{ email: "c@d.com" }], "c@d.com"), { attendees: [{ email: "a@b.com" }] });
});

test("link do Meet", () => {
  assert.equal(linkMeetDoEvento({ hangoutLink: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
  assert.equal(linkMeetDoEvento({ conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/x" }] } }), "https://meet.google.com/x");
  assert.equal(linkMeetDoEvento({}), null);
});

test("ação pendente para o botão 'tentar de novo'", () => {
  assert.equal(acaoPendente(leadBase({ reuniao_em: em }), "reuniao"), "criar");
  assert.equal(acaoPendente(leadBase({ reuniao_em: em, evento_google_id: "e" }), "confirmacao"), "mover");
  assert.equal(acaoPendente(leadBase({ evento_google_id: "e" }), "perdido"), "cancelar");
  assert.equal(acaoPendente(leadBase({ evento_google_id: "e" }), "remarcacao"), null);
  assert.equal(acaoPendente(leadBase(), "padrao"), null);
});
