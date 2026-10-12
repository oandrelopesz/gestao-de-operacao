// Kit da marca: ligação (pasta do cofre e conta), logos, tom de voz, design system, fontes, saúde e Drive.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderSync, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import { fetchContas, type ContaInstagram } from "@/lib/instagram";
import {
  cofreArquivos, cofrePastas, enviarFonte, enviarLogo, kitDoCofre, lerPastasDrive, salvarCliente, urlArquivo, type ClienteConteudo,
} from "@/lib/conteudo";
import { ROTULO_VARIANTE, VARIANTES_LOGO, type VarianteLogo } from "../../../supabase/functions/conteudo/regras.ts";
import { Campo } from "./Clientes";

const formDe = (c: ClienteConteudo) => ({
  pasta_cofre: c.pasta_cofre ?? "", ig_conta_id: c.ig_conta_id ?? "", tom_de_voz: c.tom_de_voz, design_system: c.design_system,
  saude: c.saude, ia_pode_pessoas: c.ia_pode_pessoas, drive_url: c.drive_url,
});
const PESOS = ["300", "400", "500", "600", "700", "800"];

export function AbaKit({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [f, setF] = useState(() => formDe(cliente));
  const [pastas, setPastas] = useState<string[]>([]);
  const [contas, setContas] = useState<ContaInstagram[]>([]);
  const [cofre, setCofre] = useState<{ destino: "tom_de_voz" | "design_system"; arquivos: { caminho: string; conteudo: string }[] } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [google, setGoogle] = useState("");
  const [arquivoFonte, setArquivoFonte] = useState({ familia: "", peso: "400" });
  // Rascunho volta ao salvo ao trocar de cliente ou quando o texto salvo muda (o kit do cofre grava por fora)
  useEffect(() => { setF(formDe(cliente)); }, [cliente.id, cliente.design_system, cliente.tom_de_voz]);
  useEffect(() => {
    cofrePastas().then((r) => setPastas(r.pastas)).catch(() => {});
    fetchContas().then((cs) => setContas(cs.filter((c) => c.ativa))).catch(() => {});
  }, []);
  const mudou = JSON.stringify(f) !== JSON.stringify(formDe(cliente));

  async function fazer(nome: string, acao: () => Promise<unknown>, ok?: string) {
    setOcupado(nome);
    try {
      await acao();
      if (ok) toast.success(ok);
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }
  const salvar = () => fazer("salvar", () => salvarCliente(cliente.id, { ...f, pasta_cofre: f.pasta_cofre || null, ig_conta_id: f.ig_conta_id || null }), "Kit salvo.");
  const trocarLogo = (v: VarianteLogo, arquivo: File) => fazer(`logo-${v}`, async () => {
    const logo = await enviarLogo(cliente.id, v, arquivo);
    await salvarCliente(cliente.id, { logos: [...cliente.logos.filter((l) => l.variante !== v), logo] });
  }, "Logo enviada.");
  const removerLogo = (v: VarianteLogo) => fazer(`logo-${v}`, () => salvarCliente(cliente.id, { logos: cliente.logos.filter((l) => l.variante !== v) }));
  const addGoogle = () => fazer("fonte", async () => {
    await salvarCliente(cliente.id, { fontes: [...cliente.fontes, { familia: google.trim(), origem: "google" }] });
    setGoogle("");
  });
  const addArquivo = (arquivo: File) => fazer("fonte", async () => {
    const fonte = await enviarFonte(cliente.id, arquivo, arquivoFonte.familia, Number(arquivoFonte.peso));
    await salvarCliente(cliente.id, { fontes: [...cliente.fontes, fonte] });
    setArquivoFonte({ familia: "", peso: "400" });
  }, "Fonte enviada.");
  const removerFonte = (i: number) => fazer("fonte", () => salvarCliente(cliente.id, { fontes: cliente.fontes.filter((_, j) => j !== i) }));
  const puxar = (destino: "tom_de_voz" | "design_system") => fazer("cofre", async () => {
    if (!f.pasta_cofre) throw new Error("Escolha a pasta do cofre antes.");
    const r = await cofreArquivos(f.pasta_cofre);
    if (!r.arquivos.length) throw new Error("O cofre deste cliente não tem nota de design system nem de tom de voz.");
    setCofre({ destino, arquivos: r.arquivos });
  });
  const puxarTudo = () => fazer("tudo", async () => {
    const { kit } = await kitDoCofre(cliente.id);
    toast.success(`Kit puxado: ${kit.fontes} fontes, ${kit.logos} logos, ${kit.pilares} pilares${kit.conta ? ", conta do Instagram" : ""}${kit.drive ? ", Drive" : ""}.`);
    kit.avisos.forEach((a) => toast.warning(a));
  });
  const puxarFontes = () => fazer("fontes", async () => {
    const { kit } = await kitDoCofre(cliente.id, true);
    toast.success("Fontes atualizadas do cofre.");
    kit.avisos.forEach((a) => toast.warning(a));
  });
  const lerDrive =() => fazer("drive", async () => {
    await salvarCliente(cliente.id, { drive_url: f.drive_url.trim() });
    const r = await lerPastasDrive(cliente.id);
    toast.success(`${r.pastas.length} ${r.pastas.length === 1 ? "pasta com imagens" : "pastas com imagens"}.`);
  });

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={puxarTudo} disabled={!!ocupado}>
        {ocupado === "tudo" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderSync className="mr-1 h-4 w-4" />}Puxar tudo do cofre
      </Button>
      <section className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Pasta no cofre de clientes">
          <Select value={f.pasta_cofre} onValueChange={(v) => setF({ ...f, pasta_cofre: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha a pasta" /></SelectTrigger>
            <SelectContent>{pastas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo rotulo="Conta do Instagram">
          <Select value={f.ig_conta_id} onValueChange={(v) => setF({ ...f, ig_conta_id: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
            <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>@{c.usuario}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Logos</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VARIANTES_LOGO.map((v) => {
            const logo = cliente.logos.find((l) => l.variante === v);
            return (
              <div key={v} className="space-y-1 rounded border p-2">
                <div className="text-xs text-muted-foreground">{ROTULO_VARIANTE[v]}</div>
                <div className={`flex h-20 items-center justify-center rounded ${v === "clara" ? "bg-neutral-800" : "bg-muted"}`}>
                  {ocupado === `logo-${v}` ? <Loader2 className="h-4 w-4 animate-spin" />
                    : logo ? <img src={urlArquivo(logo.chave)} alt={`Logo ${ROTULO_VARIANTE[v]}`} className="max-h-16 max-w-full object-contain" />
                    : <span className="text-xs text-muted-foreground">Sem logo</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">{logo ? "Trocar" : "Enviar"}
                      <input type="file" accept={ACEITA_IMAGENS} className="hidden"
                        onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) trocarLogo(v, a); }} />
                    </label>
                  </Button>
                  {logo && <Button variant="ghost" size="icon" aria-label={`Remover logo ${ROTULO_VARIANTE[v]}`} onClick={() => removerLogo(v)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Tom de voz</h3>
          <Button variant="ghost" size="sm" onClick={() => puxar("tom_de_voz")} disabled={!!ocupado}><FolderSync className="mr-1 h-4 w-4" />Puxar do cofre</Button>
        </div>
        <Textarea rows={6} value={f.tom_de_voz} onChange={(e) => setF({ ...f, tom_de_voz: e.target.value })} />
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Design system</h3>
          <Button variant="ghost" size="sm" onClick={() => puxar("design_system")} disabled={!!ocupado}><FolderSync className="mr-1 h-4 w-4" />Puxar do cofre</Button>
        </div>
        <Textarea rows={10} value={f.design_system} onChange={(e) => setF({ ...f, design_system: e.target.value })} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Fontes</h3>
          <Button variant="ghost" size="sm" onClick={puxarFontes} disabled={!!ocupado}>
            {ocupado === "fontes" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderSync className="mr-1 h-4 w-4" />}Puxar do cofre
          </Button>
        </div>
        {cliente.fontes.map((fonte, i) => (
          <div key={`${fonte.familia}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
            <span>{fonte.familia}{fonte.peso ? ` ${fonte.peso}` : ""} ({fonte.origem === "google" ? "Google Fonts" : fonte.origem === "fontshare" ? "Fontshare" : fonte.chave?.startsWith("instagram/conteudo/cofre/") ? "arquivo do cofre" : "arquivo"})</span>
            <Button variant="ghost" size="icon" aria-label={`Remover fonte ${fonte.familia}`} onClick={() => removerFonte(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <details className="space-y-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">Ajustar fontes à mão</summary>
        <div className="flex flex-wrap items-end gap-2 pt-2">
          <Campo rotulo="Do Google Fonts"><Input placeholder="Ex.: Space Grotesk" value={google} onChange={(e) => setGoogle(e.target.value)} /></Campo>
          <Button variant="outline" disabled={!google.trim() || !!ocupado} onClick={addGoogle}>Adicionar</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Arquivo de fonte (família)"><Input placeholder="Ex.: Clash Display" value={arquivoFonte.familia} onChange={(e) => setArquivoFonte({ ...arquivoFonte, familia: e.target.value })} /></Campo>
          <Campo rotulo="Peso">
            <Select value={arquivoFonte.peso} onValueChange={(v) => setArquivoFonte({ ...arquivoFonte, peso: v })}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{PESOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Button variant="outline" asChild disabled={!arquivoFonte.familia.trim() || !!ocupado}>
            <label className={arquivoFonte.familia.trim() ? "cursor-pointer" : "pointer-events-none opacity-50"}>Enviar arquivo
              <input type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden"
                onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) addArquivo(a); }} />
            </label>
          </Button>
        </div>
        </details>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.saude} onCheckedChange={(v) => setF({ ...f, saude: v })} />Cliente da área da saúde (regras do CFM/CFO no texto)</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.ia_pode_pessoas} onCheckedChange={(v) => setF({ ...f, ia_pode_pessoas: v })} />A IA pode gerar imagens com pessoas</label>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Banco de imagens (pasta do Google Drive)</h3>
        <div className="flex gap-2">
          <Input placeholder="Link da pasta-mãe do Drive" value={f.drive_url} onChange={(e) => setF({ ...f, drive_url: e.target.value })} />
          <Button variant="outline" onClick={lerDrive} disabled={!f.drive_url.trim() || !!ocupado}>{ocupado === "drive" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ler pastas</Button>
        </div>
        {cliente.drive_pastas.length > 0 && (
          <ul className="text-sm text-muted-foreground">
            {cliente.drive_pastas.map((p) => <li key={p.id}>{p.caminho} ({p.quantidade} {p.quantidade === 1 ? "imagem" : "imagens"})</li>)}
          </ul>
        )}
      </section>

      <Button onClick={salvar} disabled={!mudou || !!ocupado}>{ocupado === "salvar" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar kit</Button>

      <Dialog open={!!cofre} onOpenChange={(v) => !v && setCofre(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escolha a nota do cofre</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {cofre && cofre.arquivos.map((a) => (
              <Button key={a.caminho} variant="outline" className="w-full justify-start"
                onClick={() => { setF({ ...f, [cofre.destino]: a.conteudo }); setCofre(null); }}>{a.caminho}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
