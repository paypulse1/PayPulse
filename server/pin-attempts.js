export async function verifyPinWithAttemptLimit(
  pool,
  email,
  pin,
  matchesPin,
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const securityResult = await client.query(
      `SELECT pin_salt, pin_hash FROM merchant_security
       WHERE email = $1 FOR UPDATE`,
      [email],
    )
    const security = securityResult.rows[0]
    if (!security?.pin_hash) {
      await client.query("COMMIT")
      return {
        status: 403,
        error: "Set up an MPIN before transferring.",
        reason: "not_configured",
      }
    }

    await client.query(
      "DELETE FROM merchant_pin_attempts WHERE created_at <= NOW() - INTERVAL '1 day'",
    )
    const attempts = await client.query(
      `SELECT COUNT(*)::int AS count FROM merchant_pin_attempts
       WHERE merchant_email = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [email],
    )
    if (attempts.rows[0].count >= 5) {
      await client.query("COMMIT")
      return {
        status: 429,
        error: "Too many incorrect MPIN attempts. Try again in 15 minutes.",
        reason: "rate_limited",
      }
    }

    if (!matchesPin(pin, security.pin_salt, security.pin_hash)) {
      await client.query(
        "INSERT INTO merchant_pin_attempts (merchant_email) VALUES ($1)",
        [email],
      )
      await client.query("COMMIT")
      return { status: 403, error: "The MPIN is incorrect.", reason: "invalid" }
    }

    await client.query(
      "DELETE FROM merchant_pin_attempts WHERE merchant_email = $1",
      [email],
    )
    await client.query("COMMIT")
    return { status: 200, error: "", reason: "verified" }
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      console.error("MPIN attempt transaction rollback failed", {
        merchantEmail: email,
        error:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      })
    }
    throw error
  } finally {
    client.release()
  }
}
