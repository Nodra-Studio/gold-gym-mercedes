import { ArrowUpRight, CircleDashed, Link2 } from "lucide-react";
import "./dondejuego-integration.css";

const integrationRequest =
  "Hola, ¿cómo están? Estamos desarrollando la web de Gold Gym Mercedes y queremos vincular su agenda de pádel con DondeJuego, manteniendo la app que ya usan. Necesitamos consultar turnos disponibles y reservados, recibir cambios y cancelaciones, y evitar que un mismo horario se reserve en ambos sistemas. ¿Tienen una API, webhooks o alguna integración oficial? ¿Nos pueden pasar la documentación, los requisitos de acceso para el complejo, los costos si los hubiera y un contacto técnico? Gracias.";

export function DondeJuegoIntegration() {
  const contactUrl = `https://api.whatsapp.com/send?phone=5493425268473&text=${encodeURIComponent(integrationRequest)}`;

  return (
    <section
      className="panel dondejuego-integration"
      aria-labelledby="dondejuego-title"
    >
      <div className="dondejuego-heading">
        <h2 id="dondejuego-title">
          <Link2 size={21} aria-hidden="true" /> DondeJuego
        </h2>
        <span className="dondejuego-status">
          <CircleDashed size={15} aria-hidden="true" /> Pendiente de
          habilitación
        </span>
      </div>
      <p>
        El objetivo es reunir los turnos de pádel en la agenda de Gold Gym y
        seguir usando DondeJuego. Para avanzar, necesitamos que su equipo
        confirme el acceso a los datos del complejo y cómo compartir las
        reservas.
      </p>
      <div className="dondejuego-current">
        <strong>Estado actual</strong>
        <p>
          Las agendas todavía no se sincronizan. Un turno cargado en DondeJuego
          no aparece automáticamente acá, y uno cargado acá no bloquea su
          disponibilidad en DondeJuego. Hasta activar la conexión, recepción
          debe verificar ambas agendas antes de confirmar.
        </p>
      </div>
      <h3>Qué necesitamos de DondeJuego</h3>
      <ul>
        <li>Autorización de Gold Gym y acceso al complejo y sus canchas.</li>
        <li>
          Una vía oficial para consultar reservas, cambios y cancelaciones.
        </li>
        <li>Confirmar cómo bloquear el mismo horario en ambas agendas.</li>
        <li>
          Condiciones de acceso, costos y un contacto técnico para probarlo.
        </li>
      </ul>
      <div className="form-actions">
        <a
          href={contactUrl}
          className="button gold"
          target="_blank"
          rel="noopener noreferrer"
        >
          Consultar a DondeJuego <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <a
          href="https://www.dondejuegoapp.com/faq"
          className="text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver información oficial <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <p className="muted dondejuego-contact-note">
        Se abre WhatsApp con una consulta preparada para que puedas revisarla y
        enviarla. Esto no conecta las agendas ni envía el mensaje por sí solo.
      </p>
    </section>
  );
}
