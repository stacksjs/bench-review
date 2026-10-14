# Threat response and judicial-privacy removals

Internal runbook. One page on purpose — it is read in a hurry.

**This is not legal advice.** It describes what this platform can do and the
order to do it in. Decisions about reporting to law enforcement, responding to
legal process, or statutory deadlines belong to counsel.

---

## 1. A credible threat

A report arrives as a `threat` flag (the moderator email is subject-lined
`URGENT`) or by any other route — the contact form under "Report a review",
email, a phone call from a court.

**Preserve first. Do not hard-delete anything.**

1. **Take it down through the admin UI.** `/admin/reviews` → the review →
   Delete. This is a *soft* delete: the row survives with `status = 'removed'`
   and `deleted_at` stamped, and the moderation log keeps a snapshot of exactly
   what was published. It disappears from the public site immediately.

   Do not delete rows from the database directly. That is the one action that
   destroys the evidence.

2. **Write down what you saw.** The snapshot captures the review. It does not
   capture context — the reporter's words, the time you were told, who else
   you spoke to. Put that in the moderation note.

3. **Escalate to the person responsible for legal.** Same day. A threat against
   a federal judge may engage 18 U.S.C. § 115; that assessment is not a
   moderator's to make, and it is not one to leave until Monday.

4. **Preserve the account too.** Do not delete the author's account while a
   threat is open — account deletion removes their reviews, and you will want
   them. Suspend instead (`/admin/users` → Suspend), which blocks sign-in and
   leaves everything in place.

5. **If law enforcement contacts us**, route it through the contact form's
   "Legal request" topic or to the legal address so it is recorded, and hand it
   to counsel. Do not respond to a request for user identity on your own — see
   the Privacy Policy's "Legal demands for reviewer identity".

**What is already preserved, without you doing anything:** the review row and
its text, the moderation log snapshot, who moderated and when, and prior
versions of the review if the author had edited it.

---

## 2. A judicial-privacy removal request

A judge, a family member, or someone acting for them asks for personal
information to be removed. Federal law (the Daniel Anderl Judicial Security and
Privacy Act) and several state "Daniel's Law" statutes set short deadlines —
**72 hours** is the figure to plan against — and some carry private rights of
action.

1. **Record when it arrived.** The clock starts then. If it came through the
   contact form it is already in `contact_messages` with a timestamp; if it came
   by email, forward it through the form so there is a record.

2. **Redact rather than delete.** `/admin/reviews` → the review → edit its
   content to remove the covered information. The obligation is to remove the
   personal information, not the opinion around it. Deleting an otherwise
   lawful review is over-removal and a worse outcome for its author.

   A reason is required and is kept with a snapshot of the original.

3. **Take the whole review down only if nothing is left** once the covered
   information is gone.

4. **Check for copies.** The same address may appear in a comment, a judge
   response, or a second review. Search before closing the request.

5. **Reply to the requester** confirming what was done and when.

**Covered information** typically includes a home address, a personal phone
number, a personal email, a Social Security number, a vehicle registration, a
spouse or child's name or employer, and the name of a school a child attends.
When in doubt, redact and ask afterwards.

---

## 3. What we tell people

- The Terms state that credible threats are preserved and may be reported.
- The Privacy Policy states that a demand letter alone does not get a
  reviewer's identity, and that we notify the affected user where the law
  allows before responding to legal process.
- The FAQ promises we will remove or edit personal information on request.
  Step 2 above is how that promise is kept.

---

## 4. Contacts

Set and keep current:

- `LEGAL_CONTACT_EMAIL` — where "Legal request" and "Report a review" messages
  go. **Must be monitored daily** for the 72-hour window to be meetable.
- The person responsible for legal escalation, and a backup.
- Outside counsel.

If `LEGAL_CONTACT_EMAIL` is unset, these messages fall back to the general
inbox. That is a configuration bug, not a default.
