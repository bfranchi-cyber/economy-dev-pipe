export const FAKE_TICKET_KEY = 'FAKE-1';

// This fixed Ticket source is the intentional seam for replacing the skeleton with Jira intake.
export function isFakeTicket(key: string): boolean {
  return key === FAKE_TICKET_KEY;
}
