import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FormEvento } from "@/lib/agendaEvento";
import {
  DIAS, DIAS_CURTO, DIAS_LETRA, PRESETS, descrever, diaDaSemana, identificarPreset, regraDoPreset, rotuloPreset, somarDias,
  type DiaSemana, type Freq, type Preset, type Recorrencia,
} from "@/lib/recorrencia";

interface Props { form: FormEvento; onChange: (patch: Partial<FormEvento>) => void; disabled?: boolean }

const EDITAR = "__editar__";
const GOOGLE = "__google__";

export function RecorrenciaCampo({ form, onChange, disabled }: Props) {
  const [personalizando, setPersonalizando] = useState(false);
  const preset: string = form.regraOriginal ? GOOGLE : identificarPreset(form.recorrencia, form.inicioData);

  const escolher = (v: string) => {
    if (v === EDITAR) { setPersonalizando(true); return; }
    if (v === GOOGLE || v === "personalizado") return;
    onChange({ recorrencia: regraDoPreset(v as Preset, form.inicioData), regraOriginal: null });
  };

  return (
    <>
      <Select value={preset} onValueChange={escolher} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {form.regraOriginal && <SelectItem value={GOOGLE}>Repetição personalizada do Google (mantida)</SelectItem>}
          {PRESETS.filter((p) => p !== "personalizado").map((p) => (
            <SelectItem key={p} value={p}>{rotuloPreset(p, form.inicioData)}</SelectItem>
          ))}
          {preset === "personalizado" && form.recorrencia && (
            <SelectItem value="personalizado">{descrever(form.recorrencia, form.inicioData)}</SelectItem>
          )}
          <SelectItem value={EDITAR}>Personalizado...</SelectItem>
        </SelectContent>
      </Select>
      {personalizando && (
        <PersonalizadoDialog
          form={form}
          onClose={() => setPersonalizando(false)}
          onSalvar={(r) => { onChange({ recorrencia: r, regraOriginal: null }); setPersonalizando(false); }}
        />
      )}
    </>
  );
}

const UNIDADES: { freq: Freq; singular: string; plural: string }[] = [
  { freq: "DAILY", singular: "dia", plural: "dias" },
  { freq: "WEEKLY", singular: "semana", plural: "semanas" },
  { freq: "MONTHLY", singular: "mês", plural: "meses" },
  { freq: "YEARLY", singular: "ano", plural: "anos" },
];

function PersonalizadoDialog({ form, onClose, onSalvar }: { form: FormEvento; onClose: () => void; onSalvar: (r: Recorrencia) => void }) {
  const inicial: Recorrencia = form.recorrencia ?? {
    freq: "WEEKLY", intervalo: 1, diasSemana: [diaDaSemana(form.inicioData)], mensal: "dia", fim: { tipo: "nunca" },
  };
  const [freq, setFreq] = useState<Freq>(inicial.freq);
  const [intervalo, setIntervalo] = useState(String(inicial.intervalo));
  const [dias, setDias] = useState<DiaSemana[]>(inicial.diasSemana.length ? inicial.diasSemana : [diaDaSemana(form.inicioData)]);
  const [mensal, setMensal] = useState(inicial.mensal);
  const [fimTipo, setFimTipo] = useState(inicial.fim.tipo);
  const [fimData, setFimData] = useState(inicial.fim.tipo === "data" ? inicial.fim.data : somarDias(form.inicioData, 90));
  const [fimN, setFimN] = useState(String(inicial.fim.tipo === "vezes" ? inicial.fim.n : 13));

  const n = Math.max(1, Math.floor(Number(intervalo) || 1));
  const alternarDia = (d: DiaSemana) =>
    setDias((atual) => (atual.includes(d) ? (atual.length > 1 ? atual.filter((x) => x !== d) : atual) : [...atual, d]));

  const concluir = () => onSalvar({
    freq,
    intervalo: n,
    diasSemana: freq === "WEEKLY" ? dias : [],
    mensal: freq === "MONTHLY" ? mensal : "dia",
    fim: fimTipo === "data" ? { tipo: "data", data: fimData } : fimTipo === "vezes" ? { tipo: "vezes", n: Math.max(1, Math.floor(Number(fimN) || 1)) } : { tipo: "nunca" },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Repetição personalizada</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm font-normal">Repetir a cada</Label>
            <Input type="number" min={1} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className="w-16" />
            <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u.freq} value={u.freq}>{n === 1 ? u.singular : u.plural}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {freq === "WEEKLY" && (
            <div className="space-y-2">
              <Label className="text-sm font-normal">Repetir:</Label>
              <div className="flex gap-1.5">
                {DIAS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    title={DIAS_CURTO[d]}
                    aria-pressed={dias.includes(d)}
                    onClick={() => alternarDia(d)}
                    className={cn(
                      "h-8 w-8 rounded-full text-xs font-medium transition-colors",
                      dias.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                    )}
                  >
                    {DIAS_LETRA[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {freq === "MONTHLY" && (
            <Select value={mensal} onValueChange={(v) => setMensal(v as Recorrencia["mensal"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">{rotuloPreset("mensal_dia", form.inicioData)}</SelectItem>
                <SelectItem value="posicao">{rotuloPreset("mensal_pos", form.inicioData)}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-normal">Termina</Label>
            <RadioGroup value={fimTipo} onValueChange={(v) => setFimTipo(v as Recorrencia["fim"]["tipo"])} className="gap-3">
              <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="nunca" /> Nunca</label>
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="data" /> Em
                <Input type="date" value={fimData} min={form.inicioData} onChange={(e) => setFimData(e.target.value)}
                  onFocus={() => setFimTipo("data")} className="h-8 w-40" />
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="vezes" /> Após
                <Input type="number" min={1} value={fimN} onChange={(e) => setFimN(e.target.value)}
                  onFocus={() => setFimTipo("vezes")} className="h-8 w-20" /> ocorrências
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={concluir}>Concluído</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
