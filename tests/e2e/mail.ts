/**
 * Poczta lokalnego stosu (Mailpit przechwytuje e-maile Supabase Auth): link logowania z ostatniej wiadomości
 * do danego adresu. Tylko testy e2e.
 */
import { MAILPIT_URL } from '../../scripts/local-supabase/config';

type MailpitSummary = { ID: string; Created: string };
type MailpitMessage = { Subject: string; Text: string; HTML: string };

/** Czeka na nową wiadomość do `email` (wysłaną po `since`) i zwraca jej temat oraz link logowania. */
export async function waitForLoginLink(email: string, since: Date, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const fresh = messages.find((m) => new Date(m.Created) >= since);
    if (fresh) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)
      ).json()) as MailpitMessage;
      const link = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(
        message.HTML || message.Text,
      )?.[0];
      if (!link) throw new Error(`Brak linku logowania w wiadomości „${message.Subject}”`);
      return { subject: message.Subject, link: link.replace(/&amp;/g, '&'), html: message.HTML };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nie przyszedł e-mail do ${email}`);
}
