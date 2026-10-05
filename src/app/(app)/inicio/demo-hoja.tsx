"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// Marcador de posición del paso 1 (verifica hoja inferior, campos y botones). Se elimina en el paso 3.
export function DemoHoja() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variante="sol">Pendiente</Badge>
        <Badge variante="listo">Listo</Badge>
        <Badge variante="aji">Debe $ 45.000</Badge>
      </div>
      <Button bloque tamano="lg" onClick={() => setAbierta(true)}>
        Abrir hoja inferior
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <Button variante="secundario">Secundario</Button>
        <Button variante="oscuro">Oscuro</Button>
        <Button variante="exito">Éxito</Button>
        <Button variante="peligro">Peligro</Button>
      </div>
      {abierta && (
        <HojaInferior titulo="Monto" onCerrar={() => setAbierta(false)}>
          <Label htmlFor="monto">Efectivo recibido</Label>
          <Input id="monto" inputMode="numeric" placeholder="$ 0" />
          <Button bloque tamano="lg" className="mt-4" onClick={() => setAbierta(false)}>
            Listo
          </Button>
        </HojaInferior>
      )}
    </div>
  );
}
