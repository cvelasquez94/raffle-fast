/**
 * Mercado Pago Integration Helper
 *
 * Este módulo maneja la integración con Mercado Pago para generar links de pago
 */

interface CreatePaymentLinkParams {
  accessToken: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  buyerEmail?: string;
  buyerName?: string;
  externalReference: string;
  notificationUrl?: string;
}

interface PaymentLinkResponse {
  success: boolean;
  paymentLink?: string;
  preferenceId?: string;
  error?: string;
}

/**
 * Crea un link de pago de Mercado Pago usando la API de Preferences
 *
 * @param params - Parámetros para crear el link de pago
 * @returns Promise con el resultado de la operación
 */
export async function createMercadoPagoPaymentLink(
  params: CreatePaymentLinkParams
): Promise<PaymentLinkResponse> {
  try {
    const {
      accessToken,
      title,
      description,
      price,
      quantity,
      buyerEmail,
      buyerName,
      externalReference,
      notificationUrl,
    } = params;

    // Validaciones básicas
    if (!accessToken) {
      return { success: false, error: "Access token requerido" };
    }

    if (price <= 0) {
      return { success: false, error: "El precio debe ser mayor a 0" };
    }

    // Obtener la URL base del raffle actual
    const currentPath = window.location.pathname;
    const raffleId = currentPath.includes('/raffle/')
      ? currentPath.split('/raffle/')[1]?.split('?')[0] // Limpiar cualquier query param
      : '';

    // Detectar si estamos en localhost/desarrollo
    const isLocalhost = window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('192.168');

    // Construir el cuerpo de la preferencia
    const preferenceData: any = {
      items: [
        {
          title,
          description,
          quantity,
          unit_price: price,
          currency_id: "ARS",
        },
      ],
      external_reference: externalReference,
      payment_methods: {
        excluded_payment_types: [],
        installments: 1, // Sin cuotas
      },
      statement_descriptor: title.substring(0, 22), // Máximo 22 caracteres para el resumen de tarjeta
    };

    // Solo agregar back_urls y auto_return si NO estamos en localhost
    // En localhost, Mercado Pago no puede acceder a las URLs
    if (!isLocalhost && raffleId) {
      preferenceData.back_urls = {
        success: `${window.location.origin}/raffle/${raffleId}?payment=success`,
        failure: `${window.location.origin}/raffle/${raffleId}?payment=failure`,
        pending: `${window.location.origin}/raffle/${raffleId}?payment=pending`,
      };
      preferenceData.auto_return = "approved";
    }

    // Agregar información del comprador si está disponible
    if (buyerEmail) {
      preferenceData.payer = {
        email: buyerEmail,
      };

      if (buyerName) {
        preferenceData.payer.name = buyerName;
      }
    }

    // Agregar URL de notificaciones (webhooks) si está configurada
    if (notificationUrl) {
      preferenceData.notification_url = notificationUrl;
    }

    // Hacer la petición a la API de Mercado Pago
    const response = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(preferenceData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Error de Mercado Pago:", errorData);
      return {
        success: false,
        error: errorData.message || `Error HTTP: ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      paymentLink: data.init_point, // Link de pago para usuarios normales
      preferenceId: data.id,
    };
  } catch (error: any) {
    console.error("Error al crear link de pago:", error);
    return {
      success: false,
      error: error.message || "Error desconocido al crear el link de pago",
    };
  }
}

/**
 * Obtiene el estado de un pago desde Mercado Pago
 *
 * @param accessToken - Access token de Mercado Pago
 * @param paymentId - ID del pago
 * @returns Promise con la información del pago
 */
export async function getPaymentStatus(
  accessToken: string,
  paymentId: string
): Promise<any> {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Error al obtener estado del pago:", error);
    throw error;
  }
}

/**
 * Busca pagos asociados a una preferencia de Mercado Pago
 *
 * @param accessToken - Access token de Mercado Pago
 * @param preferenceId - ID de la preferencia
 * @returns Promise con los pagos asociados a la preferencia
 */
export async function searchPaymentsByPreference(
  accessToken: string,
  preferenceId: string
): Promise<any> {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?preference_id=${preferenceId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Error al buscar pagos:", error);
    throw error;
  }
}
