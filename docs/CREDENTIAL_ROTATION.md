# Credential rotation checklist

Complete this after deployment and keep replacement values out of Git, logs and chat.

- [ ] Rotate the Supabase database password shared during setup; update any database connection strings that use it.
- [ ] Inventory the Supabase API keys actually used by Inventopedia. Rotate any exposed or temporary secret/service-role key using the Supabase dashboard's current key-rotation procedure; update the server-side `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Never put it in frontend variables.
- [ ] If the project's public/anon key or JWT signing keys are rotated, update `SUPABASE_ANON_KEY` and any deployed client configuration that uses the old key. Follow Supabase's migration procedure for signing keys so existing sessions are handled deliberately.
- [ ] Migrate the legacy JWT-based anon and service-role API keys to Supabase publishable and secret keys before their announced early-2027 retirement. Verify SDK compatibility, user JWT authentication, privileged API calls and RLS before disabling the legacy keys.
- [ ] Update any affected Vercel environment variables for every environment in use, then redeploy so running functions receive the new values.
- [ ] Verify the hosted health endpoint, a new sign-in, authorised project access and denied cross-project access; verify attachments if enabled.
- [ ] Revoke old credentials only after confirming the replacement works, and record the rotation date without recording the values.

The database password is separate from Supabase Auth user passwords. Inventory other credentials before rotating them; do not rotate unrelated project secrets without checking their consumers.
