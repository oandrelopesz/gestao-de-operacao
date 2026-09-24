import { Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemasLista, type ApiTemas } from "@/components/temas/TemasLista";
import {
  EVENTO_TEMAS_LINKS, atualizarTema, criarTema, excluirTema, fetchLinks, fetchTemas, moverTema, traduzErroLinks,
} from "@/lib/links";

const apiTemasLinks: ApiTemas = {
  evento: EVENTO_TEMAS_LINKS,
  item: { singular: "link", plural: "links" },
  exemplo: "Ex.: Ferramentas de IA",
  traduzErro: traduzErroLinks,
  fetchTemas,
  async contar() {
    const qtd: Record<string, number> = {};
    (await fetchLinks()).forEach((x) => { if (x.tema_id) qtd[x.tema_id] = (qtd[x.tema_id] || 0) + 1; });
    return qtd;
  },
  criar: criarTema,
  atualizar: atualizarTema,
  excluir: excluirTema,
  mover: moverTema,
};

/** Criar, renomear, trocar a cor, reordenar e excluir temas de links (usada na aba Links e no Admin). */
export function TemasLinksLista() {
  return <TemasLista api={apiTemasLinks} />;
}

const DESCRICAO = 'Os filtros da aba Links, nesta ordem. Ao excluir um tema, os links dele ficam em "Sem tema".';

/** Dialog do botão "Temas" na aba Links. */
export function TemasLinksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Temas dos links</DialogTitle>
          <DialogDescription>{DESCRICAO}</DialogDescription>
        </DialogHeader>
        {open && <TemasLinksLista />}
      </DialogContent>
    </Dialog>
  );
}

/** Card da seção "Links" do Admin. */
export function LinksTemasCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 size={18} /> Temas dos links</CardTitle>
        <CardDescription>{DESCRICAO}</CardDescription>
      </CardHeader>
      <CardContent>
        <TemasLinksLista />
      </CardContent>
    </Card>
  );
}
