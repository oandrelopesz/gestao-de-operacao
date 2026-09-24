import { Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplatesView } from "@/components/processos/TemplatesView";

/** Seção "Roadmap" do Admin: templates de roadmap. */
export function RoadmapAdminSecao() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Layers size={18} /> Templates de roadmap</CardTitle>
        <CardDescription>Os mesmos templates da aba Roadmap.</CardDescription>
      </CardHeader>
      <CardContent>
        <TemplatesView tipo="roadmap" />
      </CardContent>
    </Card>
  );
}
