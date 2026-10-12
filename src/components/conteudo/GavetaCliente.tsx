// Gaveta do cliente na aba Conteúdo: Kit da marca, Pilares e agenda, Moldes, e desligar o cliente.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cofreArquivos, desligarCliente, haQuanto, type ClienteConteudo } from "@/lib/conteudo";
import { AbaAgenda } from "./AbaAgenda";
import { AbaKit } from "./AbaKit";

export function GavetaCliente({ cliente, fechar, recarregar }: { cliente: ClienteConteudo; fechar: () => void; recarregar: () => void }) {
  const [cofre, setCofre] = useState<string>("carregando...");
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    if (!cliente.pasta_cofre) { setCofre("sem pasta do cofre"); return; }
    cofreArquivos(cliente.pasta_cofre)
      .then((r) => setCofre(`${r.total} ${r.total === 1 ? "arquivo copiado" : "arquivos copiados"}, sincronizado ${haQuanto(r.sincronizado_em)}`))
      .catch((e) => setCofre(`não deu para ler (${e.message})`));
  }, [cliente.pasta_cofre]);
  async function desligar() {
    try {
      await desligarCliente(cliente.id);
      toast.success("Cliente desligado.");
      fechar();
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Sheet open onOpenChange={(v) => !v && fechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{cliente.clientes?.nome ?? "Cliente"}</SheetTitle>
          <SheetDescription>Cofre: {cofre}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="kit" className="mt-4">
          <TabsList>
            <TabsTrigger value="kit">Kit da marca</TabsTrigger>
            <TabsTrigger value="agenda">Pilares e agenda</TabsTrigger>
            <TabsTrigger value="moldes">Moldes</TabsTrigger>
          </TabsList>
          <TabsContent value="kit"><AbaKit cliente={cliente} recarregar={recarregar} /></TabsContent>
          <TabsContent value="agenda"><AbaAgenda cliente={cliente} recarregar={recarregar} /></TabsContent>
          <TabsContent value="moldes"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>
        </Tabs>
        <div className="mt-8 border-t pt-4">
          {confirmar
            ? <Button variant="destructive" onClick={desligar}>Clique de novo para desligar (os posts gerados deste cliente somem)</Button>
            : <Button variant="ghost" className="text-destructive" onClick={() => setConfirmar(true)}>Desligar cliente</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
