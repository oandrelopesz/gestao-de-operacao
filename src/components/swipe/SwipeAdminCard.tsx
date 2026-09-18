import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HardDrive, ExternalLink, KeyRound, RefreshCw, CheckCircle2, AlertTriangle, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { driveStatus, oauthUrl, getSwipeKey, setSwipeKey, ensureFolder, getAccessToken, type DriveStatus } from "@/lib/googleDrive";
import { fetchSwipeConfig, saveSwipeConfig, erroAmigavel, type SwipeConfig } from "@/lib/swipe";
import { FALLBACK_USER_ID, getUserId } from "@/lib/clientesService";

/**
 * Card do Admin: conexão com o Google Drive (OAuth), chave do swipe file e pasta raiz "Swipe File".
 * A chave fica só neste navegador (localStorage); o segredo de verdade está nos secrets do projeto.
 */
export function SwipeAdminCard() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [config, setConfig] = useState<SwipeConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(getSwipeKey());
  const [salvandoChave, setSalvandoChave] = useState(false);
  const [criandoRaiz, setCriandoRaiz] = useState(false);

  const load = async () => {
    try {
      const [s, c] = await Promise.all([driveStatus(), fetchSwipeConfig()]);
      setStatus(s);
      setConfig(c);
      setErro(null);
    } catch (e) {
      setErro(erroAmigavel(e));
    }
  };

  useEffect(() => {
    load();
    // Retorno do OAuth (?google_connected=1 / ?google_error=...)
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected")) {
      toast.success("Google Drive conectado");
      saveSwipeConfig({ conectado_em: new Date().toISOString() }).catch(() => {});
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_error")) {
      toast.error(`Google recusou a conexão: ${params.get("google_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const conectar = async () => {
    if (!status?.client_id || !status.redirect_uri) {
      toast.error("GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI não configurados nos secrets do projeto.");
      return;
    }
    const userId = (await getUserId()) || FALLBACK_USER_ID;
    const returnTo = `${window.location.origin}/admin`;
    window.location.href = oauthUrl(status.client_id, status.redirect_uri, userId, returnTo);
  };

  const salvarChave = async () => {
    setSalvandoChave(true);
    setSwipeKey(chave.trim());
    try {
      await getAccessToken();
      toast.success("Chave válida: este navegador já pode enviar arquivos ao Drive");
    } catch (e: any) {
      toast.error(e.message || "Chave inválida");
    } finally {
      setSalvandoChave(false);
    }
  };

  const copiarLink = async () => {
    const link = `${window.location.origin}/swipe#swipe_key=${encodeURIComponent(chave.trim())}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado: abra no outro aparelho e a chave fica salva lá");
    } catch {
      window.prompt("Copie o link e abra no outro aparelho:", link);
    }
  };

  const criarRaiz = async () => {
    setCriandoRaiz(true);
    try {
      const folder = await ensureFolder("Swipe File", null);
      await saveSwipeConfig({ root_folder_id: folder.id, root_folder_link: folder.webViewLink || null });
      toast.success('Pasta "Swipe File" pronta no seu Drive');
      await load();
    } catch (e: any) {
      toast.error(erroAmigavel(e));
    } finally {
      setCriandoRaiz(false);
    }
  };

  const conectado = !!status?.connected;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><HardDrive size={18} /> Google Drive (Swipe file)</CardTitle>
          <CardDescription>
            Conta do Drive onde o <Link to="/swipe" className="underline underline-offset-2">swipe file</Link> guarda os arquivos. Tudo vai para a pasta mestra "Swipe File".
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={load}><RefreshCw size={14} /> Atualizar</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <p className="font-medium flex items-center gap-2">
              {conectado ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-amber-500" />}
              {conectado ? "Drive conectado" : "Drive não conectado"}
            </p>
            <p className="text-xs text-muted-foreground">
              {conectado
                ? `Autorizado com a conta escolhida na tela do Google${config?.conectado_em ? ` em ${new Date(config.conectado_em).toLocaleDateString("pt-BR")}` : ""}. Escopo: só os arquivos criados pelo app.`
                : "Clique em conectar e escolha a conta contato@andrelopes.digital na tela do Google."}
            </p>
          </div>
          <Button size="sm" className="shrink-0" variant={conectado ? "outline" : "default"} onClick={conectar}>
            {conectado ? "Reconectar" : "Conectar Google"}
          </Button>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <Label htmlFor="swipe-key" className="flex items-center gap-2"><KeyRound size={14} /> Chave do swipe file (neste navegador)</Label>
          <div className="flex gap-2">
            <Input id="swipe-key" type="password" placeholder="Cole a chave configurada no projeto" value={chave} onChange={(e) => setChave(e.target.value)} autoComplete="off" />
            <Button onClick={salvarChave} disabled={salvandoChave || !chave.trim()}>{salvandoChave ? "Verificando..." : "Salvar"}</Button>
            <Button variant="outline" onClick={copiarLink} disabled={!chave.trim()} title="Abra o link no celular ou em outro navegador para configurar a chave lá">Copiar link p/ outro aparelho</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            É o que impede quem tiver a URL do sistema de mexer no seu Drive. Precisa ser informada uma vez em cada navegador/celular.
            {status && !status.key_configured && <span className="text-amber-600"> Secret SWIPE_KEY ainda não configurado no projeto.</span>}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <p className="font-medium">Pasta mestra "Swipe File"</p>
            {config?.root_folder_id ? (
              <a href={config.root_folder_link || `https://drive.google.com/drive/folders/${config.root_folder_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                Abrir no Drive <ExternalLink size={11} />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Ainda não criada. Depois de conectar e salvar a chave, clique ao lado.</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config?.root_folder_id && <Badge variant="outline" className="text-[10px]">ok</Badge>}
            <Button size="sm" variant="outline" className="gap-2" onClick={criarRaiz} disabled={criandoRaiz || !conectado}>
              <FolderPlus size={14} /> {config?.root_folder_id ? "Verificar" : "Criar pasta"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
