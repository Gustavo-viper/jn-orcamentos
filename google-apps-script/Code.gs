function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty("JNG_APP_SHARED_SECRET") || "";
    const expectedSender = (properties.getProperty("EXPECTED_SENDER_EMAIL") || "").trim().toLowerCase();
    const suppliedSecret = String(data.secret || "");

    if (!secret || !constantTimeEqual(secret, suppliedSecret)) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }

    const effectiveSender = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
    if (!expectedSender || effectiveSender !== expectedSender) {
      return jsonResponse({ ok: false, error: "sender_mismatch" });
    }

    const to = String(data.to || "").trim().toLowerCase();
    const code = String(data.code || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^\d{8}$/.test(code)) {
      return jsonResponse({ ok: false, error: "invalid_request" });
    }

    MailApp.sendEmail({
      to: to,
      subject: "Confirme seu e-mail — J&N Orçamentos",
      body: "Seu código para confirmar a conta J&N Orçamentos é: " + code +
        "\n\nO código vence em 10 minutos e só pode ser usado uma vez.\n" +
        "Se você não solicitou esta conta, ignore esta mensagem.",
      name: "J&N Orçamentos",
      replyTo: expectedSender
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Verification email delivery failed:", error && error.message);
    return jsonResponse({ ok: false, error: "delivery_failed" });
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: "J&N account confirmation" });
}

function constantTimeEqual(left, right) {
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, left, Utilities.Charset.UTF_8);
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, right, Utilities.Charset.UTF_8);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}