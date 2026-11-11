# AI, voice and invoicing — separate capabilities

The request mentions **AI**, **voice** and **generate invoice**. These are complementary features, but should not be conflated.

## AI assistant (planned)

Access from `/workspace/assistant` for authorized owner/manager/staff users. Suggested grounded questions:

- "How many perfumes were sold today?"
- "Which products are running low?"
- "Show unpaid invoices from this month."
- "Which suppliers have overdue purchase orders?"
- "What were online versus POS sales this week?"

The model must call **server-owned, role-authorized tools** and ground every numerical answer in a dated business-data query. Never let the model run arbitrary SQL, change product prices, approve refunds or issue invoices on its own. Destructive/financial actions require explicit human confirmation and audited service methods. AI cannot see records beyond the user's location and role permissions.

## Voice interaction (planned, requires confirmation)

- Microphone -> user-approved speech-to-text -> the same AI tool flow -> readable result.
- Transcripts may include personal/business data: clarify consent, retention and access first.
- Provide text input as a complete fallback and require confirmation before any action.
- Do not imply voice commands are implemented in the scaffold.

## Sales invoices (core operations module)

- Create draft from sale/order or manually from authorized customer and line items.
- Issue immutable invoice number following an owner-approved sequence and tax policy.
- Track due date, amount, partial payments, status and approved credit note.
- Generate downloadable printable PDF and record dispatch/delivery audit later.
- A receipt is evidence of payment; an invoice may be issued before payment.

The current `/workspace/invoices` page is an illustrative UI only. No invoice generation or PDF service exists yet.

