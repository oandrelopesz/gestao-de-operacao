// Antes de ler o Drive: o navegador precisa do login Google e a conexão precisa do escopo drive.readonly.
import { useCallback, useEffect, useState } from "react";
import { FolderLock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { DRIVE_LEITURA_SCOPE, DriveAuthError, getAccessToken, oauthUrl, statusDoDrive } from "@/lib/googleDrive";
import { FALLBACK_USER_ID, getUserId } from "@/lib/clientesService";

export type EstadoAcesso = "verificando" | "sem_login" | "sem_permissao" | "pronto" | "erro";
export interface AcessoDrive {
  estado: EstadoAcesso;
  clientId: string | null;
  erro: string | null;
  verificar: (forcar?: boolean) => Promise<void>;
  semPermissao: () => void;
}

export function useAcessoDrive(): AcessoDrive {
  const [estado, setEstado] = useState<EstadoAcesso>("verificando");
  const [clientId, setClientId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const verificar = useCallback(async (forcar = false) => {
    setEstado("verificando");
    try {
      const st = await statusDoDrive(forcar);
      setClientId(st.client_id);
      // Só com drive.file a listagem das pastas volta vazia (sem erro): por isso a checagem vem antes
      if (!st.connected || !(st.scope ?? "").split(/\s+/).includes(DRIVE_LEITURA_SCOPE)) {
        setEstado("sem_permissao");
        return;
      }
      await getAccessToken();
      setEstado("pronto");
    } catch (e) {
      if (e instanceof DriveAuthError) { setEstado("sem_login"); return; }
      setErro(e instanceof Error ? e.message : "Não consegui falar com o Google");
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    // Volta do consentimento do Google (?google_connected=1 / ?google_error=...)
    const p = new URLSearchParams(window.location.search);
    if (p.get("google_connected")) toast.success("Google reconectado: a aba já pode ler o Drive");
    else if (p.get("google_error")) toast.error(`Google recusou a conexão: ${p.get("google_error")}`);
    void verificar(p.has("google_connected"));
  }, [verificar]);

  // Estável: o NavegadorPasta usa em dependência de efeito (uma função nova a cada render relistaria em loop)
  const semPermissao = useCallback(() => setEstado("sem_permissao"), []);

  return { estado, clientId, erro, verificar, semPermissao };
}

async function conectarLeitura() {
  try {
    const st = await statusDoDrive(true);
    if (!st.client_id || !st.redirect_uri) { toast.error("Credenciais do Google não configuradas no projeto"); return; }
    const userId = (await getUserId()) || FALLBACK_USER_ID;
    window.location.href = oauthUrl(st.client_id, st.redirect_uri, userId, `${window.location.origin}/dados-internos`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conexão");
  }
}

export function AcessoGoogle({ acesso }: { acesso: AcessoDrive }) {
  if (acesso.estado === "verificando") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> Conectando ao Drive…
      </div>
    );
  }
  if (acesso.estado === "sem_permissao") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderLock size={26} /></span>
          <p className="text-base font-semibold">Libere a leitura do Drive</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Autorize uma vez com a conta contato@andrelopes.digital. Swipe file e Agenda continuam funcionando como antes.
          </p>
          <Button className="mt-1" onClick={() => void conectarLeitura()}>Conectar leitura do Drive</Button>
        </CardContent>
      </Card>
    );
  }
  if (acesso.estado === "sem_login") {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="space-y-3 p-4 text-sm">
          <p className="font-medium">Entre com o Google neste navegador para ver as respostas</p>
          {acesso.clientId
            ? <BotaoGoogleLogin clientId={acesso.clientId} onEntrou={() => void acesso.verificar(true)} />
            : <p className="text-muted-foreground">Configure o login Google no Admin.</p>}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm">
        <p className="text-destructive">{acesso.erro}</p>
        <Button variant="outline" onClick={() => void acesso.verificar(true)}>Tentar de novo</Button>
      </CardContent>
    </Card>
  );
}
