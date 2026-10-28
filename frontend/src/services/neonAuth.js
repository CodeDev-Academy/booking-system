/**
 * Neon Auth Client Service
 * Wires the Neon Auth endpoints provisioned via `neon deploy`
 */

export const getNeonAuthConfig = () => {
  return {
    baseUrl: import.meta.env.VITE_NEON_AUTH_BASE_URL || 'https://ep-withered-base-b4ntuw0q.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth',
    jwksUrl: import.meta.env.VITE_NEON_AUTH_JWKS_URL || 'https://ep-withered-base-b4ntuw0q.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json',
  };
};

/**
 * Validates connectivity to the Neon Auth JWKS endpoint
 */
export const checkNeonAuthHealth = async () => {
  const { jwksUrl, baseUrl } = getNeonAuthConfig();
  try {
    const res = await fetch(jwksUrl, { method: 'GET' });
    if (!res.ok) {
      return { ok: false, error: `Neon Auth returned status ${res.status}` };
    }
    const data = await res.json();
    return {
      ok: true,
      baseUrl,
      jwksUrl,
      keysCount: Array.isArray(data?.keys) ? data.keys.length : 0,
      keys: data?.keys || [],
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
