import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { GOOGLE_CLIENT_ID, loginSilencioso, renderBotaoGoogle } from "@/lib/googleAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  component: LoginComponent,
});

// Login só com Google. O Supabase aceita apenas o e-mail já cadastrado (cadastro novo desligado),
// e a sessão fica salva no navegador com renovação automática: só sai ao deslogar ou limpar os dados do site.
function LoginComponent() {
  const navigate = useNavigate();
  const botao = useRef<HTMLDivElement>(null);
  const entrando = useRef(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    const entrar = async (idToken: string) => {
      if (entrando.current) return;
      entrando.current = true;
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (!vivo) return;
      if (error) {
        entrando.current = false;
        setErro(/signup|not allowed|não permit/i.test(error.message) ? "Esta conta Google não tem acesso." : error.message);
        return;
      }
      navigate({ to: "/", replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (vivo && data.session) navigate({ to: "/", replace: true });
    });
    if (botao.current) renderBotaoGoogle(GOOGLE_CLIENT_ID, botao.current, entrar, (e) => setErro(e.message));
    loginSilencioso(GOOGLE_CLIENT_ID).then((t) => { if (t) void entrar(t); });
    return () => { vivo = false; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Gestor Pro</CardTitle>
          <CardDescription>Entre com a conta Google autorizada.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <div ref={botao} className="min-h-[44px]" />
          {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
