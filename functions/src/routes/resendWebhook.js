const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { Resend } = require("resend");

const router = express.Router();

// NOTE: You must set VITE_RESEND_WEBHOOK_SECRET in your .env or Firebase functions Config.
// The resend webhook secret is unique to the webhook endpoint you create in Resend dashboard.
const RESEND_WEBHOOK_SECRET = process.env.VITE_RESEND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET || "";

function verifyResendSignature(req) {
    if (!RESEND_WEBHOOK_SECRET) {
        console.warn("Missing RESEND_WEBHOOK_SECRET configuration.");
        return false;
    }

    try {
        const svix_id = String(req.headers["svix-id"] || "");
        const svix_timestamp = String(req.headers["svix-timestamp"] || "");
        const svix_signature = String(req.headers["svix-signature"] || "");

        // Resend webhooks use Svix which signs the payload
        if (!svix_id || !svix_timestamp || !svix_signature) {
            return false;
        }

        // svix signature format: v1,signature
        const signatures = svix_signature.split(" ").map(s => s.split(',')[1]).filter(Boolean);
        if (signatures.length === 0) return false;

        // Use raw body for HMAC verification
        const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.rawBody || "");
        const bodyString = bodyBuffer.toString("utf8");

        const signedContent = `${svix_id}.${svix_timestamp}.${bodyString}`;

        // The secret in the Resend dashboard is base64 encoded with a 'whsec_' prefix
        const secretStr = RESEND_WEBHOOK_SECRET.startsWith('whsec_')
            ? RESEND_WEBHOOK_SECRET.replace('whsec_', '')
            : RESEND_WEBHOOK_SECRET;

        const secretBuffer = Buffer.from(secretStr, "base64");

        const expectedSignature = crypto
            .createHmac("sha256", secretBuffer)
            .update(signedContent)
            .digest("base64");

        // Compare expected signature with any of the provided signatures
        for (const sig of signatures) {
            if (crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(sig))) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error("Resend webhook verification error:", error);
        return false;
    }
}

router.post("/events", async (req, res) => {
    try {
        const isValid = verifyResendSignature(req);
        if (!isValid && process.env.NODE_ENV === "production") {
            console.warn("Resend webhook rejected: invalid signature");
            return res.status(401).json({ error: "Invalid webhook signature" });
        }

        let payload;
        try {
            // Raw body is required for verification; parse after.
            payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString("utf8")) : req.body;
            if (typeof payload === 'string') payload = JSON.parse(payload);
        } catch (parseError) {
            return res.status(400).json({ error: "Invalid JSON payload" });
        }

        const type = payload.type || "";
        const data = payload.data || {};

        console.log(`Received Resend webhook event: ${type}`);

        // Track the email event delivery status in firestore
        if (data.email_id) {
            const db = admin.firestore();

            const emailRecordData = {
                lastEvent: type,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Store event specific data
            if (type === "email.delivered") {
                emailRecordData.status = "delivered";
                emailRecordData.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (type === "email.bounced") {
                emailRecordData.status = "bounced";
                emailRecordData.bouncedAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (type === "email.complained") {
                emailRecordData.status = "complained";
                emailRecordData.complainedAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (type === "email.opened") {
                emailRecordData.openedAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (type === "email.clicked") {
                emailRecordData.clickedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await db.collection("emails").doc(data.email_id).set(emailRecordData, { merge: true });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Resend webhook error:", error);
        return res.status(500).json({ error: "Webhook processing failed" });
    }
});

module.exports = router;