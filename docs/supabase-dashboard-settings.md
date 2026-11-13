# Supabase dashboard settings (Ky applies these; code can't)

Project: `aquaone-health`. Open supabase.com/dashboard → the project.

## 1. URL configuration — Authentication → URL Configuration
- **Site URL:** `https://aquaone-health.vercel.app` (change to `https://app.trypurestream.com` once the domain is live).
- **Redirect URLs** (add each):
  - `https://aquaone-health.vercel.app/**`
  - `https://app.trypurestream.com/**`
  - `http://localhost:3000/**`

## 2. Sign-in email — Authentication → Emails → Templates → **Magic Link**
The app signs in with `signInWithOtp`, which sends the **Magic Link** template. Replace its content so it carries both the 6-digit code and the link (the code is what works inside an iPhone Home Screen app):

- **Subject:** `Your AquaOne Health sign-in code: {{ .Token }}`
- **Body (HTML):**
```html
<h2>Your sign-in code</h2>
<p style="font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>Type this code in AquaOne Health, or tap the button below on this phone.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to AquaOne Health</a></p>
<p>This code works for 1 hour. If you didn't ask for it, you can ignore this email.</p>
```
The link must point at `/auth/confirm?token_hash=…&type=email` (not the default `{{ .ConfirmationURL }}`), because the app verifies the token hash on the server.

Do the same for **Confirm signup** (a member's very first sign-in can send this one instead): same subject and body.

## 3. Code length — Authentication → Providers → Email
- **Email OTP length:** `6` (the app's code box takes 6 digits).
- **Email OTP expiration:** `3600` seconds (1 hour).
- **Confirm email:** leave ON.

## 4. Before launch — Authentication → Emails → SMTP Settings (custom SMTP via Resend)
Supabase's built-in email sender is limited to a handful of emails an hour and is for testing only. Before launch:
- Enable custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key with sending access, sender `AquaOne Health <hello@notify.trypurestream.com>`.
- Needs the Resend domain `notify.trypurestream.com` verified first (DNS step).
- Then raise **Authentication → Rate Limits → emails per hour** (e.g. 300).

## 5. Vercel environment variables (Vercel → aquaone-health → Settings → Environment Variables)
Add the same values as `.env.local` for Production and Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Then **Redeploy** (the `NEXT_PUBLIC_` values are baked in at build time, so a redeploy is required after adding them).
