# Deployment checklist — read before clicking deploy

- [ ] Create a **new** staging site, not the current production site.
- [ ] Connect the project through GitHub or use Netlify CLI; a static drag-and-drop upload does not build the server function.
- [ ] Add `OPENAI_API_KEY` as a secret in the staging site's environment variables (Functions/runtime scope).
- [ ] Redeploy after adding the secret.
- [ ] Test the AI research button with one low-cost question.
- [ ] Confirm the answer includes source links and test a bad/missing question for error handling.
- [ ] Keep staging private/unlisted until durable usage controls and access protection are implemented.
- [ ] Do not remove or overwrite the existing production website until staging has passed tests.
