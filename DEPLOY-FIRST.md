# Deployment checklist — read before clicking deploy

- [ ] Create a **new** staging site, not the current production site.
- [ ] Connect the project through GitHub or use Netlify CLI; a static drag-and-drop upload does not build the server function.
- [ ] Add `OPENAI_API_KEY` as a secret in the staging site's environment variables (Functions/runtime scope).
- [ ] Redeploy after adding the secret.
- [ ] Apply the SQL migrations in `supabase/migrations/` to the staging Supabase project before testing quota rollback. The refund migration is not active until applied.
- [ ] Test sign-up, sign-in, one low-cost AI research question, and a deliberate upstream failure; verify the quota is restored after the failure.
- [ ] Confirm the answer includes source links and test a bad/missing question for error handling.
- [ ] Keep staging private/unlisted until account, quota, and failure-handling tests pass.
- [ ] Do not remove or overwrite the existing production website until staging has passed tests.
