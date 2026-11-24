'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Send } from 'lucide-react';

type FormState = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  website: string;
};

const initialState: FormState = {
  name: '', email: '', phone: '', subject: '', message: '', website: '',
};

type Feedback = { kind: 'success' | 'error' | 'draft'; text: string } | null;

export function ContactForm({
  onlineEnabled,
  contactEmail,
  whatsappNumber,
}: {
  onlineEnabled: boolean;
  contactEmail: string | null;
  whatsappNumber: string | null;
}) {
  const [form, setForm] = useState<FormState>(initialState);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function update<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm(previous => ({ ...previous, [name]: value }));
    if (feedback) setFeedback(null);
  }

  function messageText() {
    return [
      'Hello Golden Rose Perfume,',
      '',
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : '',
      `Subject: ${form.subject.trim()}`,
      '',
      form.message.trim(),
    ].filter(Boolean).join('\n');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (form.website.trim()) {
      setFeedback({ kind: 'error', text: 'Please check the form and try again.' });
      return;
    }

    if (!onlineEnabled) {
      if (contactEmail && messageText().length > 1600) {
        setFeedback({ kind: 'error', text: 'Please shorten the message to use your email application, or try another contact option.' });
        return;
      }
      if (contactEmail) {
        const url = `mailto:${contactEmail}?subject=${encodeURIComponent(`Golden Rose enquiry: ${form.subject.trim()}`)}&body=${encodeURIComponent(messageText())}`;
        window.location.href = url;
        setFeedback({ kind: 'draft', text: 'Your email application should open with the message prepared. Please send it from there; it has not yet been submitted by this website.' });
      } else if (whatsappNumber) {
        const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(messageText())}`;
        if (url.length > 7200) {
          setFeedback({ kind: 'error', text: 'Please shorten the message before opening WhatsApp.' });
          return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        setFeedback({ kind: 'draft', text: 'Your WhatsApp message has been prepared. Please send it in WhatsApp; opening the conversation does not submit it.' });
      } else {
        setFeedback({ kind: 'error', text: 'Golden Rose has not yet configured a contact channel. Please check back shortly.' });
      }
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data: unknown = await result.json().catch(() => null);
      const parsed = data && typeof data === 'object' ? data as { ok?: unknown; message?: unknown } : null;

      if (result.ok && parsed?.ok === true) {
        setForm(initialState);
        setFeedback({ kind: 'success', text: typeof parsed.message === 'string' ? parsed.message : 'Your enquiry was accepted for delivery.' });
      } else {
        setFeedback({
          kind: 'error',
          text: typeof parsed?.message === 'string' ? parsed.message : 'Your message could not be sent. Please try again.',
        });
      }
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to connect to the contact service. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const canContact = onlineEnabled || Boolean(contactEmail || whatsappNumber);
  const buttonText = onlineEnabled ? 'Send message' : contactEmail ? 'Continue in email' : whatsappNumber ? 'Continue on WhatsApp' : 'Contact unavailable';

  return (
    <form className="gr-contact__form" onSubmit={onSubmit} aria-label="Contact Golden Rose Perfume">
      <div className="gr-contact__fields-two">
        <div className="gr-contact__field">
          <label htmlFor="contact-name">Full name <span aria-hidden="true">*</span></label>
          <input id="contact-name" name="name" type="text" value={form.name} onChange={event => update('name', event.target.value)}
            placeholder="Your full name" autoComplete="name" minLength={2} maxLength={100} required />
        </div>
        <div className="gr-contact__field">
          <label htmlFor="contact-email">Email address <span aria-hidden="true">*</span></label>
          <input id="contact-email" name="email" type="email" value={form.email} onChange={event => update('email', event.target.value)}
            placeholder="you@example.com" autoComplete="email" maxLength={254} required />
        </div>
      </div>
      <div className="gr-contact__fields-two">
        <div className="gr-contact__field">
          <label htmlFor="contact-phone">Phone number <small>(optional)</small></label>
          <input id="contact-phone" name="phone" type="tel" value={form.phone} onChange={event => update('phone', event.target.value)}
            placeholder="Phone number" autoComplete="tel" maxLength={40} />
        </div>
        <div className="gr-contact__field">
          <label htmlFor="contact-subject">Subject <span aria-hidden="true">*</span></label>
          <select id="contact-subject" name="subject" value={form.subject} onChange={event => update('subject', event.target.value)} required>
            <option value="">Select a subject</option>
            <option value="Product or fragrance enquiry">Product or fragrance enquiry</option>
            <option value="Existing order">Existing order</option>
            <option value="Delivery enquiry">Delivery enquiry</option>
            <option value="Payment enquiry">Payment enquiry</option>
            <option value="Returns or after-sales">Returns or after-sales</option>
            <option value="Other enquiry">Other enquiry</option>
          </select>
        </div>
      </div>
      <div className="gr-contact__field">
        <label htmlFor="contact-message">Message <span aria-hidden="true">*</span></label>
        <textarea id="contact-message" name="message" value={form.message} onChange={event => update('message', event.target.value)}
          placeholder="Tell us how we can help…" rows={7} minLength={10} maxLength={4000} required />
        <small className="gr-contact__field-note">{form.message.length.toLocaleString()} / 4,000 characters</small>
      </div>
      <div className="gr-contact__honeypot" aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={event => update('website', event.target.value)} />
      </div>

      <p className="gr-contact__privacy">Your details will only be used to respond to this enquiry. Do not include card numbers or passwords.</p>

      <div className="gr-contact__submit-row">
        <button type="submit" disabled={busy || !canContact} className="gr-contact__submit">
          {onlineEnabled ? <Send size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}
          {busy ? 'Sending…' : buttonText}
        </button>
        <span className="gr-contact__required">* Required fields</span>
      </div>

      {feedback && (
        <p className={`gr-contact__feedback gr-contact__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
          {feedback.text}
        </p>
      )}
    </form>
  );
}