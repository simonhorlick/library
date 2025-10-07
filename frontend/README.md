# Profile site

## Development

First set up your environment by copying `.env.template` to `.env.local` and making sure the secrets are present.

```shell
npm start
```

This app generates typescript types based off the graphql schema. To pull the
latest schema from the development environment, run
`SECRET=<the hasura admin secret> npm run fetch`.

The typescript types are generated in the vite plugin
`vite-plugin-graphql-codegen` so this always happens automatically.

For the single sign on a customer can sign up with the SSO provider and then be
redirected back to the members portal to complete their profile. The redirect
will only happen on their first login, so to test this functionality it is
recommended to log in with `integration.test@admiral.digital`. This is a special
user that will always receive the complete profile page on every login, for
testing purposes.

## Cloudflare Pages

Cloudflare's [wrangler](https://github.com/cloudflare/wrangler) CLI can be used to preview a production build locally. To start a local server, run:

```
npm run serve
```

Then visit [http://localhost:8787/](http://localhost:8787/)

### Environment variables

Variables prefixed with `PUBLIC_` are inserted at build time by vite. They are
available in both the client and SSR builds, so they must not contain sensitive
information.

## End to end tests

First install the test browsers using:

```
npx playwright install
```

Then launch the e2e tests:

```
npm run test.e2e
```
