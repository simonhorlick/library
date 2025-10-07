# auth0 setup

Create these actions. Then set them up in the flow under https://manage.auth0.com/dashboard/us/dev-s8y8lvri/actions/triggers/post-login/.

Create an API (backend)

An application will be automatically created

Make sure to add the Allowed Callback URIs under the backend (Test Application) application (http://localhost:5173/auth/callback)

Change the application type to Regular Web Application.

Under Advanced Settings > Grant Types > Enable Authorization Code grant

Under the Credentials tab, make sure Application Authentication is set to None.

Change the name to something client-facing (it will appear on the Authorize App screen)

Under the tenant settings screen, make sure to add the default audience to be the same as the backend API audience under APIs.

## Testing

Forward a port on a remote server to your local machine so that auth0 can callback to you.

Must add `GatewayPorts clientspecified` into /etc/ssh/sshd_config to allow client to specify the bind address.

```bash
ssh -v -T -R 0.0.0.0:5678:localhost:5678 sg
```