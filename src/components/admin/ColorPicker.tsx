import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Seletor de cor em bolinhas, usado nos diálogos do Admin. */
export function ColorPicker({ colors, value, onChange }: { colors: string[]; value: string; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Cor</Label>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
              value === hex && "ring-2 ring-offset-2 ring-offset-background ring-zinc-900 dark:ring-zinc-100"
            )}
            style={{ backgroundColor: hex }}
            title={hex}
          >
            {value === hex && <Check size={14} className="text-white" />}
          </button>
        ))}
      </div>
    </div>
  );
}
