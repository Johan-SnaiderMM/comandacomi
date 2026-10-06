"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/aviso";

/** Aviso que llega por la dirección (?parametro=1) y se limpia al cerrarlo, para que no reaparezca al recargar. */
export function AvisoUrl({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <Aviso
      tipo="ok"
      onCerrar={() => {
        setVisible(false);
        router.replace(ruta);
      }}
    >
      {children}
    </Aviso>
  );
}
