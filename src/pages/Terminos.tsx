/*
 * ============================================================================
 * BORRADOR — PENDIENTE DE REVISIÓN LEGAL
 * ============================================================================
 * Este texto es un borrador redactado sin asesoramiento jurídico. NO debe
 * considerarse definitivo: tiene que revisarlo un/a abogado/a matriculado/a en
 * Argentina antes de lanzar una campaña (en particular lo referido a la
 * regulación de rifas y juegos de azar de cada jurisdicción, defensa del
 * consumidor, comisiones y limitación de responsabilidad).
 *
 * Los datos entre corchetes ([RAZÓN SOCIAL], [CUIT], [DOMICILIO LEGAL],
 * [EMAIL DE CONTACTO], [JURISDICCIÓN], [FECHA]) son marcadores a completar por
 * el titular del sitio. No inventar ni completar con datos supuestos.
 * ============================================================================
 */
import { Link } from "react-router-dom";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

const Terminos = () => (
  <LegalLayout title="Términos y condiciones" lastUpdated="[FECHA]">
    <LegalSection title="1. Quiénes somos">
      <p>
        Rifa rápida (en adelante, "la Plataforma") es un servicio operado por <strong>[RAZÓN SOCIAL]</strong>,
        CUIT [CUIT], con domicilio en [DOMICILIO LEGAL], República Argentina. Podés escribirnos a{" "}
        <strong>[EMAIL DE CONTACTO]</strong>.
      </p>
      <p>
        Al crear una cuenta o usar la Plataforma aceptás estos Términos y condiciones y nuestra{" "}
        <Link to="/privacidad">Política de privacidad</Link>. Si no estás de acuerdo, no uses la Plataforma.
      </p>
    </LegalSection>

    <LegalSection title="2. Qué es (y qué no es) la Plataforma">
      <p>
        La Plataforma es una <strong>herramienta de gestión</strong>: permite que una persona u organización
        (el "Organizador") cree un talonario digital, lo comparta mediante un enlace, registre reservas y
        ventas de números y, si lo desea, cobre en línea a través de Mercado Pago.
      </p>
      <p>
        La Plataforma <strong>no organiza, promueve, patrocina ni administra rifas o sorteos</strong>, no es
        parte de la relación entre el Organizador y quienes compran o reservan números (los "Participantes"),
        no custodia el dinero recaudado, no realiza los sorteos y no entrega premios.
      </p>
    </LegalSection>

    <LegalSection title="3. Responsabilidad del Organizador">
      <p>El Organizador es el único y exclusivo responsable de su rifa. En particular, declara y garantiza que:</p>
      <ul>
        <li>
          Cumple con la normativa nacional, provincial y municipal aplicable a rifas, sorteos y juegos de azar,
          y cuenta con las autorizaciones, permisos o habilitaciones que correspondan en su jurisdicción.
        </li>
        <li>Tiene capacidad legal para organizar la rifa y, si actúa en nombre de una institución, está autorizado por ella.</li>
        <li>La información que publica (premio, precio, fecha y modalidad del sorteo, datos de contacto) es veraz y completa.</li>
        <li>Realizará el sorteo en las condiciones anunciadas y entregará los premios a quienes resulten ganadores.</li>
        <li>Cumple con sus obligaciones fiscales y con la normativa de defensa del consumidor frente a los Participantes.</li>
        <li>
          Trata los datos personales de los Participantes conforme a la Ley 25.326 y los usa únicamente para
          gestionar la rifa.
        </li>
      </ul>
      <p>
        El Organizador se obliga a mantener indemne a [RAZÓN SOCIAL] frente a cualquier reclamo de
        Participantes, autoridades o terceros originado en su rifa.
      </p>
    </LegalSection>

    <LegalSection title="4. Participantes">
      <p>
        Quien reserva o compra un número contrata directamente con el Organizador. Cualquier consulta o reclamo
        sobre la rifa, el pago, el sorteo o el premio debe dirigirse al Organizador, cuyos datos de contacto
        figuran en el talonario.
      </p>
      <p>
        Las reservas tienen una vigencia limitada, informada al momento de reservar. Si no se concreta el pago
        dentro de ese plazo, el número puede volver a quedar disponible.
      </p>
      <p>La participación en rifas está destinada a personas mayores de 18 años.</p>
    </LegalSection>

    <LegalSection title="5. Pagos y comisiones">
      <p>
        El uso de la Plataforma para crear talonarios y gestionar reservas coordinadas por WhatsApp es gratuito.
      </p>
      <p>
        Los pagos en línea son procesados por <strong>Mercado Pago</strong> y se acreditan{" "}
        <strong>directamente en la cuenta de Mercado Pago del Organizador</strong>, quien debe vincularla
        previamente. La Plataforma no recibe ni retiene el dinero de los Participantes.
      </p>
      <p>
        Sobre cada pago en línea aprobado, la Plataforma cobra una <strong>comisión por uso del servicio</strong>,
        que se descuenta automáticamente al momento del pago. El porcentaje vigente se informa al Organizador
        antes de habilitar los cobros en línea. Esta comisión es independiente de los cargos que Mercado Pago
        aplique por su propio servicio.
      </p>
      <p>
        Los pagos coordinados por fuera de la Plataforma (efectivo, transferencia, etc.) son acordados
        exclusivamente entre el Organizador y el Participante.
      </p>
      <p>
        Las devoluciones, contracargos y cancelaciones se rigen por las políticas de Mercado Pago y deben ser
        gestionados por el Organizador. [DEFINIR CON ASESOR LEGAL: tratamiento de la comisión de la Plataforma
        en caso de devolución.]
      </p>
    </LegalSection>

    <LegalSection title="6. Cuenta de usuario">
      <p>
        Para crear talonarios necesitás registrarte con datos verdaderos y mantenerlos actualizados. Sos
        responsable de la confidencialidad de tu contraseña y de toda la actividad realizada desde tu cuenta.
      </p>
    </LegalSection>

    <LegalSection title="7. Usos prohibidos">
      <p>No está permitido usar la Plataforma para:</p>
      <ul>
        <li>Organizar rifas o sorteos ilegales, no autorizados o fraudulentos.</li>
        <li>Ofrecer premios cuya comercialización o entrega esté prohibida o restringida.</li>
        <li>Publicar información falsa o engañosa, o suplantar la identidad de personas o instituciones.</li>
        <li>Recolectar datos de Participantes para fines distintos de la gestión de la rifa.</li>
        <li>Interferir con el funcionamiento o la seguridad de la Plataforma.</li>
      </ul>
      <p>
        Podemos suspender o dar de baja talonarios y cuentas que incumplan estos Términos, y colaborar con las
        autoridades competentes cuando corresponda.
      </p>
    </LegalSection>

    <LegalSection title="8. Limitación de responsabilidad">
      <p>
        La Plataforma se ofrece "tal cual está". En la máxima medida permitida por la ley aplicable,
        [RAZÓN SOCIAL] no responde por la legalidad de las rifas, la realización de los sorteos, la entrega de
        los premios, el destino de los fondos recaudados ni por los incumplimientos de Organizadores o
        Participantes. Tampoco garantiza la disponibilidad ininterrumpida del servicio ni responde por fallas
        de servicios de terceros (como Mercado Pago o WhatsApp).
      </p>
      <p>
        Nada de lo aquí dispuesto limita los derechos irrenunciables que la normativa de defensa del consumidor
        reconoce a los usuarios.
      </p>
    </LegalSection>

    <LegalSection title="9. Propiedad intelectual">
      <p>
        La marca, el software y los contenidos de la Plataforma pertenecen a [RAZÓN SOCIAL] o a sus
        licenciantes. El Organizador conserva los derechos sobre el contenido que publica y nos autoriza a
        mostrarlo en la Plataforma con el fin de prestar el servicio.
      </p>
    </LegalSection>

    <LegalSection title="10. Cambios en estos Términos">
      <p>
        Podemos modificar estos Términos. Publicaremos la versión actualizada en esta página con su fecha de
        vigencia y, si los cambios son relevantes, lo avisaremos por los medios de contacto registrados.
      </p>
    </LegalSection>

    <LegalSection title="11. Ley aplicable y jurisdicción">
      <p>
        Estos Términos se rigen por las leyes de la República Argentina. Cualquier controversia se someterá a
        los tribunales competentes de [JURISDICCIÓN], sin perjuicio del derecho de los consumidores a reclamar
        ante los tribunales de su domicilio.
      </p>
    </LegalSection>

    <LegalSection title="12. Contacto">
      <p>
        Por consultas sobre estos Términos escribinos a <strong>[EMAIL DE CONTACTO]</strong>.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default Terminos;
