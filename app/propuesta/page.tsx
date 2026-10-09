import Link from "next/link";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
export const metadata = {
  title: "Presentación del ecosistema",
  robots: { index: false, follow: false },
};
export default function Proposal() {
  return (
    <main className="proposal">
      <Link href="/" className="text-link">
        <ArrowLeft size={16} /> Ver la página
      </Link>
      <p className="eyebrow" style={{ marginTop: 50 }}>
        NODRA STUDIO / PROPUESTA PARA GOLD GYM
      </p>
      <h1>
        Todo el club.
        <br />
        <em>Una misma experiencia.</em>
      </h1>
      <p>
        Una web propia para mostrar lo que ya construyeron. Una gestión que
        acompañe el día a día. Y una agenda de pádel conectada con el club.
      </p>
      <div className="notice">
        Plataforma propia de Gold Gym: web, socios, acceso por DNI y reservas de
        pádel en un solo proyecto. La puesta en marcha requiere validar los datos
        del club y conectar el hardware de acceso.
      </div>
      <section className="panel">
        <p className="phase">ETAPA 01 · PRESENCIA DIGITAL</p>
        <h2>Una página que se sienta Gold.</h2>
        <p>
          Musculación, Pilates y pádel, con sus fotos, su identidad y sus sedes.
          Desde el celular, una persona puede conocer el club, elegir dónde ir y
          consultar cómo sumarse.
        </p>
        <ul>
          <li>Web adaptable a celular, tablet y computadora.</li>
          <li>Sedes, mapas, contacto y página de pádel.</li>
          <li>
            Base técnica para posicionamiento local, tras confirmar los datos y
            el dominio.
          </li>
        </ul>
        <div className="links">
          <Link href="/" className="button gold">
            Recorrer la web <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="panel">
        <p className="phase">ETAPA 02 · GESTIÓN DEL GIMNASIO</p>
        <h2>Menos tareas repetidas. Más control.</h2>
        <p>
          Socios, planes y cobros en un mismo lugar. Vencimientos a la vista,
          cupos de clases y un ingreso por DNI que consulta la membresía.
        </p>
        <ul>
          <li>
            Alta y edición de socios, planes, pausa de membresías y exportación.
          </li>
          <li>Registro manual de cobros y renovación del período.</li>
          <li>Ingresos y gastos por sede, categoría y medio de pago.</li>
          <li>Precios administrables y publicación de tarifas en la web.</li>
          <li>Clases con cupo y registro de ingresos.</li>
          <li>
            Roles para recepción y terminal; importación de socios y
            comprobación de respaldos.
          </li>
          <li>
            Integración física del molinete sujeta a relevamiento y pruebas.
          </li>
        </ul>
        <div className="links">
          <Link href="/gestion" className="button gold">
            Probar gestión <ArrowUpRight size={18} />
          </Link>
          <Link href="/ingreso" className="button">
            Probar ingreso por DNI <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="panel">
        <p className="phase">ETAPA 03 · PÁDEL</p>
        <h2>Cuatro canchas. Una agenda clara.</h2>
        <p>
          Reservas por día y cancha, turnos fijos semanales, bloqueos y registro
          de señas. El sistema comprueba disponibilidad al guardar.
        </p>
        <ul>
          <li>Control de reservas simultáneas sobre el mismo turno.</li>
          <li>Series de 4, 8 o 12 semanas.</li>
          <li>Cancelación individual, historial y saldo pendiente.</li>
          <li>
            Solicitudes públicas sin crear una cuenta, con comprobante de seña
            opcional y confirmación por recepción.
          </li>
          <li>Pronóstico orientativo para la franja del turno, cuando esté disponible.</li>
          <li>Los cobros online y mensajes automáticos requieren una integración adicional.</li>
        </ul>
        <div className="links">
          <Link href="/reservas" className="button gold">
            Probar la agenda <ArrowUpRight size={18} />
          </Link>
          <Link href="/turnos" className="button">
            Probar como jugador <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="panel">
        <p className="phase">UNA TRANSICIÓN CUIDADA</p>
        <h2>Cambiar de sistema, con un plan.</h2>
        <p>
          La puesta en marcha se realiza después de revisar los equipos, los
          datos y las reglas del club. Primero se prueba; después se migra.
        </p>
        <ul>
          <li>Confirmar horarios, tarifas, sedes y permisos del personal.</li>
          <li>
            Revisar exportación del proveedor actual y titularidad del hardware.
          </li>
          <li>
            Definir accesos propios del club, copias de seguridad y soporte.
          </li>
          <li>Probar el molinete, los cortes de conexión y la recuperación.</li>
          <li>
            Comparar el costo total de operación antes de reemplazar los abonos
            actuales.
          </li>
        </ul>
      </section>
      <p className="muted">
        La propiedad y entrega de código, dominio, datos y cuentas se define por
        contrato. Un sistema propio también requiere infraestructura,
        mantenimiento y soporte.
      </p>
    </main>
  );
}
