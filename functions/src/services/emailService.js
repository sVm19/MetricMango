const { getEmailConfig } = require("../utils/runtimeConfig");

const DEFAULT_FROM = "Metric Mango <alerts@metricmango.com>";

async function sendEmail({ to, subject, text }) {
  // Prefer Firebase Functions config; fall back to env for local development.
  const config = getEmailConfig();
  const apiKey = config.resend.apiKey;
  const from = config.resend.from || DEFAULT_FROM;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed: ${response.status} ${body}`);
  }

  return response.json();
}

module.exports = {
  sendEmail
};
