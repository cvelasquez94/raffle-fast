/*
 * ============================================================================
 * BORRADOR — PENDIENTE DE REVISIÓN LEGAL
 * ============================================================================
 * Este texto es un borrador redactado sin asesoramiento jurídico. NO debe
 * considerarse definitivo: tiene que revisarlo un/a abogado/a matriculado/a en
 * Argentina antes de lanzar una campaña (Ley 25.326 de Protección de Datos
 * Personales, inscripción de bases ante la AAIP, transferencias
 * internacionales, plazos de conservación y uso de cookies/analítica).
 *
 * Los datos entre corchetes ([RAZÓN SOCIAL], [CUIT], [DOMICILIO LEGAL],
 * [EMAIL DE CONTACTO], [PLAZO DE CONSERVACIÓN], [FECHA]) son marcadores a
 * completar por el titular del sitio. No inventar ni completar con datos
 * supuestos.
 *
 * Si se cambia qué datos guarda la app o qué proveedores se usan (Supabase,
 * Vercel, Mercado Pago, Google Analytics, Meta Pixel), actualizar este texto.
 * ============================================================================
 */
import { Link } from "react-router-dom";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

const Privacidad = () => (
  <LegalLayout title="Política de privacidad" lastUpdated="[FECHA]">
    <LegalSection title="1. Responsable de los datos">
      <p>
        El responsable del tratamiento de los datos personales recolectados a través de Rifa rápida (la
        "Plataforma") es <strong>[RAZÓN SOCIAL]</strong>, CUIT [CUIT], con domicilio en [DOMICILIO LEGAL],
        República Argentina. Contacto: <strong>[EMAIL DE CONTACTO]</strong>.
      </p>
      <p>
        Esta política se rige por la Ley 25.326 de Protección de Datos Personales y sus normas complementarias,
        y complementa nuestros <Link to="/terminos">Términos y condiciones</Link>.
      </p>
    </LegalSection>

    <LegalSection title="2. Qué datos recolectamos">
      <p>
        <strong>De quienes organizan rifas (Organizadores):</strong>
      </p>
      <ul>
        <li>Nombre, email y, de forma opcional, teléfono, al crear la cuenta.</li>
        <li>Si te registrás con Google, los datos básicos de perfil que Google nos comparte (nombre y email).</li>
        <li>La información de tus talonarios: título, descripción, precio y número de WhatsApp de contacto.</li>
        <li>
          Si vinculás Mercado Pago, las credenciales de autorización que Mercado Pago nos entrega para poder
          generar los cobros a tu nombre. No accedemos a tu contraseña de Mercado Pago.
        </li>
      </ul>
      <p>
        <strong>De quienes reservan o compran números (Participantes):</strong>
      </p>
      <ul>
        <li>Nombre y, según el caso, email y teléfono, ingresados al reservar o pagar.</li>
        <li>Los números reservados o comprados y el estado del pago.</li>
      </ul>
      <p>
        <strong>Datos de pago:</strong> los pagos en línea son procesados por Mercado Pago. No recibimos ni
        almacenamos datos de tarjetas. Solo guardamos el identificador y el estado de la operación.
      </p>
      <p>
        <strong>Datos de uso:</strong> si la analítica está habilitada, se recolecta información estadística
        sobre el uso del sitio (páginas visitadas, acciones realizadas, tipo de dispositivo) mediante cookies
        o tecnologías similares de Google Analytics y Meta. No enviamos a esas herramientas nombres, emails ni
        teléfonos.
      </p>
    </LegalSection>

    <LegalSection title="3. Para qué usamos los datos">
      <ul>
        <li>Crear y administrar tu cuenta.</li>
        <li>Publicar los talonarios y registrar reservas, ventas y pagos.</li>
        <li>Permitir que el Organizador identifique y contacte a quienes reservaron o compraron números.</li>
        <li>Generar los cobros en línea a través de Mercado Pago y calcular la comisión de la Plataforma.</li>
        <li>Brindar soporte, prevenir fraudes y cumplir obligaciones legales.</li>
        <li>Medir y mejorar el funcionamiento de la Plataforma.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para fines distintos de los indicados.</p>
    </LegalSection>

    <LegalSection title="4. Con quién se comparten">
      <ul>
        <li>
          <strong>Con el Organizador de la rifa:</strong> los datos que un Participante ingresa al reservar o
          pagar son visibles únicamente para el Organizador de ese talonario, que los usa para gestionar la
          rifa y es responsable de ese uso. No se muestran públicamente.
        </li>
        <li>
          <strong>Información pública del talonario:</strong> el título, la descripción, el precio, el nombre
          del Organizador y el estado de cada número (disponible, reservado, pagado o vendido) son visibles
          para cualquier persona que tenga el enlace. El número de WhatsApp del Organizador se utiliza para que
          los Participantes puedan contactarlo.
        </li>
        <li>
          <strong>Con proveedores que nos prestan servicios:</strong> Supabase (base de datos y autenticación),
          Vercel (alojamiento del sitio), Mercado Pago (procesamiento de pagos), Google (inicio de sesión y,
          si está habilitada, analítica) y Meta (analítica, si está habilitada). Algunos de estos proveedores
          pueden almacenar datos en servidores ubicados fuera de la Argentina.
        </li>
        <li>
          <strong>Con autoridades:</strong> cuando una norma o una orden de autoridad competente lo exija.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="5. Conservación">
      <p>
        Conservamos los datos mientras tu cuenta esté activa o mientras sean necesarios para los fines
        indicados, y luego durante [PLAZO DE CONSERVACIÓN] para cumplir obligaciones legales o resolver
        reclamos.
      </p>
    </LegalSection>

    <LegalSection title="6. Tus derechos">
      <p>
        Podés solicitar en cualquier momento el acceso, la rectificación, la actualización o la supresión de
        tus datos personales escribiendo a <strong>[EMAIL DE CONTACTO]</strong>. Si sos Participante de una
        rifa, también podés dirigirte al Organizador.
      </p>
      <p>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en
        forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al
        efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.
      </p>
      <p>
        La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326,
        tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en
        sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
      </p>
    </LegalSection>

    <LegalSection title="7. Seguridad">
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger los datos (conexiones cifradas,
        control de acceso por usuario, credenciales de pago resguardadas del lado del servidor). Ningún sistema
        es completamente seguro; si detectás un problema, avisanos a [EMAIL DE CONTACTO].
      </p>
    </LegalSection>

    <LegalSection title="8. Menores de edad">
      <p>
        La Plataforma está dirigida a personas mayores de 18 años. No recolectamos intencionalmente datos de
        menores de edad.
      </p>
    </LegalSection>

    <LegalSection title="9. Cambios en esta política">
      <p>
        Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su fecha de
        actualización.
      </p>
    </LegalSection>

    <LegalSection title="10. Contacto">
      <p>
        Por consultas sobre privacidad o para ejercer tus derechos escribinos a{" "}
        <strong>[EMAIL DE CONTACTO]</strong>.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default Privacidad;
