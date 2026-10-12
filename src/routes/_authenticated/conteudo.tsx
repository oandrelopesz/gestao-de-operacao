// Aba Conteúdo: posts semanais gerados a partir do cofre, do kit da marca e dos moldes de cada cliente, com aprovação.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clientes } from "@/components/conteudo/Clientes";
import { fetchClientes, type ClienteConteudo } from "@/lib/conteudo";

export const Route = createFileRoute("/_authenticated/conteudo")({ component: ConteudoPage });

function ConteudoPage() {
  const [clientes, setClientes] = useState<ClienteConteudo[] | null>(null);
  const carregar = () => fetchClientes().then(setClientes).catch((e) => toast.error(e.message));
  useEffect(() => { carregar(); }, []);
  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6" />Conteúdo</h1>
      <Tabs defaultValue="semana">
        <TabsList>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
        </TabsList>
        <TabsContent value="semana"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>
        <TabsContent value="clientes"><Clientes clientes={clientes} recarregar={carregar} /></TabsContent>
      </Tabs>
    </div>
  );
}
