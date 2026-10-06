"use client";

import { useState } from "react";
import { HandCoins, MessageCircle } from "lucide-react";
import { botonVariantes, Button } from "@/components/ui/button";
import { enlaceWhatsapp, mensajeRecordatorio } from "@/lib/whatsapp";
import { HojaAbono } from "./hoja-abono";

/**
 * Las dos acciones de un cliente que debe: recordarle por WhatsApp (un toque: abre el chat con el mensaje listo)
 * y registrar un abono. En la demo el enlace no lleva número (los teléfonos son inventados).
 */
export function AccionesFiado({
  cliente,
  saldo,
  restaurante,
  demo,
  onAbono,
}: {
  cliente: { id: string; nombre: string; telefono: string | null };
  saldo: number;
  restaurante: string;
  demo: boolean;
  onAbono?: (mensaje: string) => void;
}) {
  const [abonando, setAbonando] = useState(false);
  if (saldo <= 0) return null;

  const enlace = enlaceWhatsapp({
    telefono: cliente.telefono,
    texto: mensajeRecordatorio({ cliente: cliente.nombre, saldo, restaurante }),
    sinNumero: demo,
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <a href={enlace} target="_blank" rel="noopener noreferrer" className={botonVariantes({ variante: "secundario", tamano: "md" })}>
          <MessageCircle className="size-5 shrink-0" aria-hidden /> Recordar
        </a>
        <Button onClick={() => setAbonando(true)}>
          <HandCoins className="size-5 shrink-0" aria-hidden /> Abonar
        </Button>
      </div>
      {abonando && (
        <HojaAbono cliente={cliente} saldo={saldo} onHecho={(m) => onAbono?.(m)} onCerrar={() => setAbonando(false)} />
      )}
    </>
  );
}
