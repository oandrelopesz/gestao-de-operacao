// Gaveta do perfil: Briefing, Agenda e Posts.
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  excluirPerfil, salvarBriefing, salvarPerfil, traduzErroGmn, type ClienteOpcao, type CtaTipo, type PerfilGmn,
} from "@/lib/gmn";
import {
  DIAS_CURTOS, HORARIOS, alternarDia, comUtm, idPastaDrive, mesmoHorario, mudarHora, normalizarAgenda, type Briefing,
} from "../../../supabase/functions/gmn/regras.ts";
import { BriefingForm } from "./BriefingForm";
import { GerarBriefingDialog } from "./GerarBriefingDialog";
import { PostsLista } from "./PostsLista";

const SEM_CLIENTE = "__sem__";
const CTAS: { v: CtaTipo; rotulo: string }[] = [
  { v: "LEARN_MORE", rotulo: "Saiba mais (abre o link)" },
  { v: "BOOK", rotulo: "Agendar (abre o link)" },
  { v: "CALL", rotulo: "Ligar (usa o telefone do perfil)" },
];

export function PerfilGaveta({ perfil, clientes, aberto, onFechar, onMudou }: {
  perfil: PerfilGmn | null; clientes: ClienteOpcao[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [dados, setDados] = useState<PerfilGmn | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [iaAberto, setIaAberto] = useState(false);
  const [excluir, setExcluir] = useState(false);

  useEffect(() => {
    setBriefing(perfil ? perfil.briefing : null);
    setDados(perfil);
  }, [perfil]);

  if (!perfil || !dados || !briefing) return null;

  async function gravarBriefing() {
    setSalvando(true);
    try {
      await salvarBriefing(perfil!.id, briefing!);
      toast.success("Briefing salvo.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gravarAgenda() {
    const d = dados!;
    if (d.cta_tipo !== "CALL" && d.cta_url && !comUtm(d.cta_url)) return toast.error("O link do botão não parece um endereço válido.");
    if (d.drive_pasta_url && !idPastaDrive(d.drive_pasta_url)) return toast.error("O link da pasta do Drive não foi reconhecido.");
    if (!d.agenda.length) return toast.error("Escolha pelo menos um dia da semana.");
    setSalvando(true);
    try {
      await salvarPerfil(d.id, {
        nome: d.nome.trim(), categoria: d.categoria || null, site: d.site || null, endereco: d.endereco || null,
        cliente_id: d.cliente_id, saude: d.saude, agenda: normalizarAgenda(d.agenda), cta_tipo: d.cta_tipo,
        cta_url: d.cta_url || null, drive_pasta_url: d.drive_pasta_url || null, usa_ia_imagem: d.usa_ia_imagem,
      });
      toast.success("Configurações salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    try {
      await excluirPerfil(perfil!.id);
      toast.success("Perfil excluído.");
      setExcluir(false);
      onFechar();
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  const set = (patch: Partial<PerfilGmn>) => setDados({ ...dados, ...patch });

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{perfil.nome}</SheetTitle>
          <SheetDescription>
            {perfil.location_name ? "Perfil sincronizado com o Google." : "Perfil criado à mão (ainda sem ligação com o Google)."}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="briefing" className="mt-4">
          <TabsList>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="briefing" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setIaAberto(true)}><Sparkles className="mr-2 h-4 w-4" />Gerar com IA</Button>
              <Button onClick={gravarBriefing} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar briefing
              </Button>
            </div>
            {perfil.briefing_salvo_em && (
              <p className="text-xs text-muted-foreground">Salvo em {new Date(perfil.briefing_salvo_em).toLocaleString("pt-BR")}.</p>
            )}
            <BriefingForm valor={briefing} onChange={setBriefing} />
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gmn-nome">Nome</Label>
                <Input id="gmn-nome" value={dados.nome} onChange={(e) => set({ nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente do sistema (opcional)</Label>
                <Select value={dados.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => set({ cliente_id: v === SEM_CLIENTE ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                    {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-categoria">Categoria</Label>
                <Input id="gmn-categoria" value={dados.categoria ?? ""} onChange={(e) => set({ categoria: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-site">Site</Label>
                <Input id="gmn-site" value={dados.site ?? ""} onChange={(e) => set({ site: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="gmn-endereco">Endereço</Label>
                <Input id="gmn-endereco" value={dados.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={dados.saude} onCheckedChange={(v) => set({ saude: v === true })} />
              Perfil da área da saúde (aplica as regras do CFM/CFO)
            </label>

            <div className="space-y-2">
              <Label>Dias e horários dos posts</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {DIAS_CURTOS.map((rotulo, d) => {
                  const ligado = dados.agenda.some((x) => x.dia === d);
                  return (
                    <Button key={d} type="button" size="sm" variant={ligado ? "default" : "outline"} aria-pressed={ligado}
                      onClick={() => set({ agenda: alternarDia(dados.agenda, d) })}>
                      {rotulo}
                    </Button>
                  );
                })}
              </div>
              {dados.agenda.map((item) => (
                <div key={item.dia} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium">{DIAS_CURTOS[item.dia]}</span>
                  <Select value={item.hora} onValueChange={(h) => set({ agenda: mudarHora(dados.agenda, item.dia, h) })}>
                    <SelectTrigger className="w-28" aria-label={`Horário de ${DIAS_CURTOS[item.dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(HORARIOS.includes(item.hora) ? HORARIOS : [item.hora, ...HORARIOS]).map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {new Set(dados.agenda.map((x) => x.hora)).size > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={() => set({ agenda: mesmoHorario(dados.agenda, dados.agenda[0].hora) })}>
                  Usar {dados.agenda[0].hora} em todos
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {dados.agenda.length === 0
                  ? "Nenhum dia escolhido: ligue pelo menos um."
                  : `${dados.agenda.length} ${dados.agenda.length === 1 ? "post" : "posts"} por semana, no horário de Brasília.`}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Botão do post</Label>
                <Select value={dados.cta_tipo} onValueChange={(v) => set({ cta_tipo: v as CtaTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CTAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {dados.cta_tipo !== "CALL" && (
                <div className="space-y-1.5">
                  <Label htmlFor="gmn-cta">Link do botão</Label>
                  <Input id="gmn-cta" placeholder="https://…" value={dados.cta_url ?? ""} onChange={(e) => set({ cta_url: e.target.value })} />
                  <p className="text-xs text-muted-foreground">A UTM do Google Meu Negócio é acrescentada ao publicar.</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gmn-drive">Pasta do Drive com fotos</Label>
              <Input id="gmn-drive" placeholder="https://drive.google.com/drive/folders/…" value={dados.drive_pasta_url ?? ""}
                onChange={(e) => set({ drive_pasta_url: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Fotos JPG ou PNG de até 5 MB. A pasta precisa estar acessível para contato@andrelopes.digital.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={dados.usa_ia_imagem} onCheckedChange={(v) => set({ usa_ia_imagem: v })} />
              Gerar imagem com IA quando não houver foto
            </label>

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button variant="outline" className="text-destructive" onClick={() => setExcluir(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir perfil
              </Button>
              <Button onClick={gravarAgenda} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configurações
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="posts">
            <PostsLista perfil={perfil} />
          </TabsContent>
        </Tabs>

        <GerarBriefingDialog perfil={perfil} aberto={iaAberto} onFechar={() => setIaAberto(false)} onGerado={setBriefing} />
        <AlertDialog open={excluir} onOpenChange={setExcluir}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {perfil.nome}?</AlertDialogTitle>
              <AlertDialogDescription>O briefing e o histórico de posts deste perfil somem do sistema. Nada muda no Google.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
