# Customer desk: setup and how the mail connection works

A record of how the desk reads email, why it works this way, and the steps that
have to be done by hand in Microsoft. Written down because none of it lives in
the code and all of it is easy to forget a year from now.

## How mail gets in

**Resend cannot receive email.** It is a send-only service. Its Webhooks section
covers delivery events on mail we send, not incoming mail. So the desk reads the
`sales@perthcabinetdoors.com.au` mailbox directly through Microsoft Graph.

Nothing about mail flow changes. Mail arrives in Outlook exactly as it always
has. There is no MX change, no forwarding rule, and nothing for the DMARC policy
of `p=reject` to trip over.

Two things this buys us that forwarding could not:

- **Sent items are read too.** A reply typed in Outlook on a phone still lands on
  the ticket, so the desk is not made wrong by answering the quick way.
- **Threading comes free.** Graph gives every message a `conversationId` that
  stays consistent across replies, so a conversation maps to a ticket without
  parsing `In-Reply-To` headers by hand.

Outgoing mail still goes through **Resend**, which is correctly set up on this
domain and is not changing.

## The app registration

At <https://entra.microsoft.com>, Applications → App registrations, an app named
**PCD Customer Desk**: single tenant, no redirect URI.

It needs the **application** permission `Mail.Read` (not delegated, because
there is no signed-in user when a background job reads a mailbox), with admin
consent granted.

Four values go in the environment. See `.env.example` for the placeholders and
`.env.local` for the notes on where each one comes from.

    MS_TENANT_ID       Directory (tenant) ID
    MS_CLIENT_ID       Application (client) ID, not the Object ID
    MS_CLIENT_SECRET   the secret's Value, not its Secret ID
    MS_MAILBOX         sales@perthcabinetdoors.com.au

**The client secret expires.** When it does, mail stops arriving. The desk says
so on screen rather than going quiet, but put the expiry date in a calendar with
a reminder a fortnight before.

## Locking the app to one mailbox

By default an application permission reads **every mailbox in the tenant**. That
is how Microsoft designed application permissions and it is not what we want. An
Application Access Policy restricts it to the one mailbox.

Run these in PowerShell as an account with Exchange administrator rights.

```powershell
# 1. The Exchange module, once per machine.
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser -Force

# 2. Sign in.
Connect-ExchangeOnline -UserPrincipalName sales@perthcabinetdoors.com.au

# 3. Restrict the app to the one mailbox.
#    Replace <MS_CLIENT_ID> with the Application (client) ID.
New-ApplicationAccessPolicy `
  -AppId <MS_CLIENT_ID> `
  -PolicyScopeGroupId sales@perthcabinetdoors.com.au `
  -AccessRight RestrictAccess `
  -Description "PCD Customer Desk may read only the sales mailbox."

# 4. Prove it. The first must say Granted, the second Denied.
Test-ApplicationAccessPolicy -Identity sales@perthcabinetdoors.com.au -AppId <MS_CLIENT_ID>
Test-ApplicationAccessPolicy -Identity <some.other@perthcabinetdoors.com.au> -AppId <MS_CLIENT_ID>

Disconnect-ExchangeOnline -Confirm:$false
```

Two things that catch people out:

- **It is not instant.** Microsoft says a new policy can take up to an hour to
  apply. `Test-ApplicationAccessPolicy` reports the intended result immediately,
  so a real Graph call may still succeed against another mailbox for a while.
- **If step 3 rejects a single mailbox**, some tenants require a group instead.
  Make a mail-enabled security group holding only the sales mailbox and pass its
  address as `-PolicyScopeGroupId`.

To undo it:

```powershell
Remove-ApplicationAccessPolicy -Identity <policy identity from Get-ApplicationAccessPolicy>
```

## Checking the connection

`graphStatus()` in `lib/pcd-graph-mail.js` answers "is the mailbox reachable, and
if not, what would fix it". It turns Microsoft's error codes into the three
things that actually go wrong: the wrong id pasted in, an expired secret, or
`Mail.Read` added as delegated rather than application.

## Related but separate: this domain's own email authentication

Noticed while reading the DNS, not caused by this work, and not fixed by it.

- The root SPF record is `v=spf1 include:secureserver.net -all`, which does not
  include Microsoft, so mail sent **from Outlook** can fail SPF.
- There are no `selector1._domainkey` / `selector2._domainkey` records, so
  Microsoft 365 DKIM is not set up either.
- DMARC is `p=reject`.

Together that means mail sent from the Outlook mailbox may be rejected by some
recipients. Mail sent through **Resend is unaffected** and is correctly signed.
Worth fixing on its own; it has nothing to do with the desk.
