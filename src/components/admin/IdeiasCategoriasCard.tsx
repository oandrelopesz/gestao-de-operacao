import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoriasIdeiasLista } from "@/components/ideias/CategoriasIdeiasDialog";

/** Card da seção "Ideias" do Admin: categorias de ideias (nome, cor, ordem). */
export function IdeiasCategoriasCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb size={18} /> Categorias de ideias</CardTitle>
        <CardDescription>
          Filtros e opções do campo "Tipo" na aba Ideias, nesta ordem. "Para cliente" é fixa: é ela que mostra os campos de agência e cliente.
          Ao excluir uma categoria, as ideias dela passam para a primeira categoria restante.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CategoriasIdeiasLista />
      </CardContent>
    </Card>
  );
}
