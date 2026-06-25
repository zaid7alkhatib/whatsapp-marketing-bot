# WhatsApp Marketing Dashboard

Focused dashboard for one-time approved WhatsApp marketing campaigns.

## What Is Included

- Dashboard login with admin/client roles.
- WhatsApp channel and account setup.
- WhatsApp QR pairing through Baileys.
- One-time marketing campaigns for selected approved recipients.
- Interested-people tracking when customers reply with `1`, `interest`, `interested`, or common misspellings.
- Automatic acknowledgement: "Thank you for your interest. A member of our team will contact you shortly."
- Campaign history with sent, failed, skipped, and cancelled recipient states.

## Local Development

1. Start MongoDB locally.
2. Copy `.env.example` to `.env` and adjust values if needed.
3. Install and run the backend:

```bash
npm install
npm run dev
```

4. Install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Default local login from `.env.example`:

- Username: `admin`
- Password: `admin`

## Marketing Guardrails

Only send one approved campaign message at a time. The composer requires explicit approval confirmation and sends exactly the message shown in the preview.
